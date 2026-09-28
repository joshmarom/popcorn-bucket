import { limitedFetch } from './fetch-limited'
import { fetchTpbTvRowsWithImdb } from './tpb-trending'
import type { MergedTrendingCandidate } from './trending-candidates'

const EZTV_API = 'https://eztv.wf/api/get-torrents'
/** Newest episodes first; three pages covers roughly the last day or two of releases. */
const EZTV_PAGES = 3
const EZTV_PAGE_LIMIT = 100

type Swarm = { maxSeeds: number; maxPeers: number; latestUploadUnix: number }

function mergeInto(
  map: Map<string, Swarm>,
  imdbId: string,
  seeds: number,
  peers: number,
  unix: number
): void {
  const prev = map.get(imdbId)
  map.set(imdbId, {
    maxSeeds: Math.max(prev?.maxSeeds ?? 0, seeds),
    maxPeers: Math.max(prev?.maxPeers ?? 0, peers),
    latestUploadUnix: Math.max(prev?.latestUploadUnix ?? 0, unix)
  })
}

function aggregateScore(c: Swarm): number {
  return c.maxSeeds * 1_000_000 + c.maxPeers * 1000 + c.latestUploadUnix / 1_000_000
}

/** EZTV sends IMDb ids as bare digits, sometimes without the leading zeros. */
function eztvImdbId(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits || /^0+$/.test(digits)) return null
  return `tt${digits.padStart(7, '0')}`
}

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

async function mergeEztvLatest(map: Map<string, Swarm>, signal?: AbortSignal): Promise<void> {
  for (let page = 1; page <= EZTV_PAGES; page++) {
    const res = await limitedFetch(`${EZTV_API}?limit=${EZTV_PAGE_LIMIT}&page=${page}`, { signal })
    if (!res.ok) throw new Error(`EZTV HTTP ${res.status}`)
    const json: unknown = await res.json()
    const torrents =
      json && typeof json === 'object' ? (json as { torrents?: unknown }).torrents : null
    if (!Array.isArray(torrents) || torrents.length === 0) return
    for (const raw of torrents) {
      if (!raw || typeof raw !== 'object') continue
      const t = raw as Record<string, unknown>
      const imdbId = eztvImdbId(t.imdb_id)
      if (!imdbId) continue
      mergeInto(map, imdbId, toNumber(t.seeds), toNumber(t.peers), toNumber(t.date_released_unix))
    }
  }
}

/** ThePirateBay TV top lists plus EZTV's newest episodes, merged by the show's IMDb id. */
export async function fetchMergedTvTrendingCandidates(
  signal?: AbortSignal
): Promise<MergedTrendingCandidate[]> {
  const byImdb = new Map<string, Swarm>()

  try {
    for (const r of await fetchTpbTvRowsWithImdb(signal)) {
      mergeInto(byImdb, r.imdbId, r.seeders, r.leechers, r.addedUnix)
    }
  } catch {
    /* TPB optional: EZTV still defines the list */
  }

  try {
    await mergeEztvLatest(byImdb, signal)
  } catch {
    /* EZTV optional: TPB still defines the list */
  }

  if (byImdb.size === 0) {
    throw new Error('No TV trending indexer responded.')
  }

  return [...byImdb.entries()]
    .map(([imdbId, v]) => ({ imdbId, ...v }))
    .sort((a, b) => aggregateScore(b) - aggregateScore(a))
}
