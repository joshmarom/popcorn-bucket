import type { ProviderHealth } from '../../src/shared/provider-health'
import { defaultRankingPreferences, scoreTorrentSource } from '../../src/shared/release-ranking'
import type { TorrentSearchResponse, TorrentSource } from '../../src/shared/torrent'
import { getLibrary } from '../../src/main/library/db'
import {
  hydrateProviderHealth,
  onProviderHealthChange
} from '../../src/main/torrent/provider-health'
import { searchTorrentSources } from '../../src/main/torrent/orchestrator'
import { listProviderHealth } from '../../src/main/torrent/scrape-providers'
import { readTorrentSearchCache, writeTorrentSearchCache } from '../../src/main/torrent/torrent-search-cache'
import { resolveTorrentSearchInput } from '../../src/main/torrent/torrent-search-resolve'
import { Hono } from 'hono'
import { z } from 'zod'
import { serverSettings } from './secrets'

const searchInput = z.object({
  title: z.string().min(1).max(400),
  releaseDate: z.string().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  forceRefresh: z.boolean().optional()
})

let healthReady = false

function rememberHealth(row: ProviderHealth): void {
  getLibrary()
    .prepare(
      `INSERT INTO provider_health (
         provider, state, consecutive_failures, last_error, last_latency_ms,
         last_result_count, retry_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider) DO UPDATE SET
         state = excluded.state,
         consecutive_failures = excluded.consecutive_failures,
         last_error = excluded.last_error,
         last_latency_ms = excluded.last_latency_ms,
         last_result_count = excluded.last_result_count,
         retry_at = excluded.retry_at,
         updated_at = excluded.updated_at`
    )
    .run(
      row.provider,
      row.state,
      row.consecutiveFailures,
      row.lastError,
      row.lastLatencyMs,
      row.lastResultCount,
      row.retryAt,
      Date.now()
    )
}

function loadHealth(): void {
  if (healthReady) return
  healthReady = true
  const rows = getLibrary()
    .prepare(
      `SELECT provider, state, consecutive_failures, last_error, last_latency_ms,
              last_result_count, retry_at
       FROM provider_health`
    )
    .all() as {
    provider: string
    state: ProviderHealth['state']
    consecutive_failures: number
    last_error: string | null
    last_latency_ms: number | null
    last_result_count: number | null
    retry_at: number | null
  }[]
  hydrateProviderHealth(
    rows.map((row) => ({
      provider: row.provider,
      state: row.state,
      consecutiveFailures: row.consecutive_failures,
      lastError: row.last_error,
      lastLatencyMs: row.last_latency_ms,
      lastResultCount: row.last_result_count,
      retryAt: row.retry_at
    }))
  )
  onProviderHealthChange(rememberHealth)
}

export function registerTorrentRoutes(app: Hono): void {
  app.post('/v1/torrents/search', async (c) => {
    const parsed = searchInput.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid search payload.', code: 'VALIDATION' })
    }
    loadHealth()
    const input = {
      title: parsed.data.title,
      releaseDate: parsed.data.releaseDate ?? null,
      imdbId: parsed.data.imdbId ?? null,
      forceRefresh: parsed.data.forceRefresh ?? false
    }
    const resolved = resolveTorrentSearchInput(input)
    if (!resolved.valid) return c.json(resolved.response)
    if (!input.forceRefresh) {
      const cached = readTorrentSearchCache(resolved.cacheKey)
      if (cached) return c.json(orderResults(cached))
    }
    const fresh = await searchTorrentSources(serverSettings(), input)
    const ordered = orderResults(fresh)
    if (ordered.ok) writeTorrentSearchCache(resolved.cacheKey, ordered)
    return c.json(ordered)
  })

  app.get('/v1/torrents/providers/health', (c) => {
    loadHealth()
    return c.json(listProviderHealth())
  })
}

function orderResults(response: TorrentSearchResponse): TorrentSearchResponse {
  if (!response.ok) return response
  const results = [...response.results].sort(byScore)
  return { ...response, results }
}

function byScore(a: TorrentSource, b: TorrentSource): number {
  const delta =
    scoreTorrentSource(b, defaultRankingPreferences) -
    scoreTorrentSource(a, defaultRankingPreferences)
  if (delta !== 0) return delta
  return b.seeders - a.seeders
}
