import type { TorrentProviderError, RawTorrentSource } from '@shared/torrent'
import type { ProviderHealth } from '@shared/provider-health'
import type { TorrentProviderContext } from './provider-context'
import {
  getProviderHealth,
  recordProviderFailure,
  recordProviderSuccess,
  shouldQueryProvider
} from './provider-health'
import { searchEztv } from './providers/eztv'
import { searchKnaben } from './providers/knaben'
import { searchLimeTorrents } from './providers/limetorrents'
import { searchPirateBay } from './providers/piratebay'
import { searchTorrentsCsv } from './providers/torrents-csv'
import { searchUindex } from './providers/uindex'
import { searchYts } from './providers/yts'

const PROVIDER_TIMEOUT_MS = 12_000

type TorrentProviderFn = (
  ctx: TorrentProviderContext,
  signal: AbortSignal
) => Promise<RawTorrentSource[]>

/** JSON APIs first; HTML scrapers (LimeTorrents, UIndex) break when their markup changes. */
const PROVIDERS: { name: string; search: TorrentProviderFn }[] = [
  { name: 'TorrentsCSV', search: searchTorrentsCsv },
  { name: 'Knaben', search: searchKnaben },
  { name: 'ThePirateBay', search: searchPirateBay },
  { name: 'YTS', search: searchYts },
  { name: 'EZTV', search: searchEztv },
  { name: 'UIndex', search: searchUindex },
  { name: 'LimeTorrents', search: searchLimeTorrents }
]

export function listProviderHealth(): ProviderHealth[] {
  return getProviderHealth(PROVIDERS.map((p) => p.name))
}

async function runOneProvider(
  provider: (typeof PROVIDERS)[number],
  ctx: TorrentProviderContext
): Promise<{ name: string; rows: RawTorrentSource[] } | { name: string; error: string }> {
  if (!shouldQueryProvider(provider.name)) {
    return { name: provider.name, error: 'Skipped after repeated failures; retrying later.' }
  }
  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const rows = await provider.search(ctx, ac.signal)
    recordProviderSuccess(provider.name, Date.now() - started, rows.length)
    return { name: provider.name, rows }
  } catch (e) {
    const msg =
      e instanceof Error ? (e.name === 'AbortError' ? 'Request timed out.' : e.message) : String(e)
    recordProviderFailure(provider.name, msg, Date.now() - started)
    return { name: provider.name, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Runs all built-in torrent providers in parallel (HTML + JSON). Each has its own timeout;
 * failures are collected in `errors` without failing the whole search, and providers that keep
 * failing are skipped for a cooldown period.
 */
export async function runTorrentProviders(ctx: TorrentProviderContext): Promise<{
  results: RawTorrentSource[]
  errors: TorrentProviderError[]
}> {
  const settled = await Promise.allSettled(PROVIDERS.map((p) => runOneProvider(p, ctx)))
  const results: RawTorrentSource[] = []
  const errors: TorrentProviderError[] = []

  settled.forEach((outcome, i) => {
    const provider = PROVIDERS[i]!
    if (outcome.status === 'fulfilled') {
      const v = outcome.value
      if ('error' in v) {
        errors.push({ provider: v.name, message: v.error })
      } else {
        results.push(...v.rows)
      }
    } else {
      const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      errors.push({ provider: provider.name, message: msg })
    }
  })

  return { results, errors }
}
