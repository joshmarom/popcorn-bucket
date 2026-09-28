import type { AppSettings } from '@shared/app-settings'
import {
  withReleaseInfo,
  type RawTorrentSource,
  type TorrentSearchInput,
  type TorrentSearchResponse,
  type TorrentSource
} from '@shared/torrent'
import { runTorrentProviders } from './scrape-providers'
import { resolveTorrentSearchInput } from './torrent-search-resolve'

const AGGREGATE_MAX = 400

/**
 * Merge rows that share the same info-hash; keep the copy with the highest seeder count, carrying
 * over TorrentClaw quality and episode details from whichever copy had them.
 */
export function dedupeTorrentSources<T extends RawTorrentSource>(rows: T[]): T[] {
  const map = new Map<string, T>()
  for (const r of rows) {
    const m = r.magnetUri?.trim().toLowerCase() ?? ''
    const btih = /btih:([a-f0-9]{40})/.exec(m)?.[1]
    const key = btih ?? `${r.providerName}\0${r.title}\0${r.size ?? ''}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, r)
      continue
    }
    const [kept, other] = r.seeders > prev.seeders ? [r, prev] : [prev, r]
    const quality = kept.quality ?? other.quality
    const tvEpisode = kept.tvEpisode ?? other.tvEpisode
    map.set(key, {
      ...kept,
      ...(quality ? { quality } : {}),
      ...(tvEpisode ? { tvEpisode } : {})
    })
  }
  return [...map.values()]
}

function sortAggregated(rows: TorrentSource[]): TorrentSource[] {
  return [...rows].sort((a, b) => {
    if (b.seeders !== a.seeders) return b.seeders - a.seeders
    return a.title.localeCompare(b.title)
  })
}

export async function searchTorrentSources(
  _settings: AppSettings,
  input: TorrentSearchInput
): Promise<TorrentSearchResponse> {
  const resolved = resolveTorrentSearchInput(input)
  if (!resolved.valid) {
    return resolved.response
  }

  const { results, errors } = await runTorrentProviders({
    query: resolved.query,
    imdbId: resolved.imdbId
  })
  const merged = sortAggregated(dedupeTorrentSources(results).map(withReleaseInfo))

  return { ok: true, results: merged.slice(0, AGGREGATE_MAX), errors }
}
