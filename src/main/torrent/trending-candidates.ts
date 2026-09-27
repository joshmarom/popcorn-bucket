import { fetchKnabenTrendingByImdb } from './knaben-trending'
import { buildImdbByInfoHash, fetchTpbMovieRowsWithImdb, type TpbTrendingRow } from './tpb-trending'
import type { YtsTrendingCandidate } from './yts-trending'
import { fetchYtsTrendingCandidates } from './yts-trending'

const TPB_LIMIT = 150
const KNABEN_LIMIT = 150

export type MergedTrendingCandidate = YtsTrendingCandidate

function aggregateScore(c: Omit<MergedTrendingCandidate, 'imdbId'>): number {
  return c.maxSeeds * 1_000_000 + c.maxPeers * 1000 + c.latestUploadUnix / 1_000_000
}

function mergeInto(
  map: Map<string, { maxSeeds: number; maxPeers: number; latestUploadUnix: number }>,
  imdbId: string,
  seeds: number,
  peers: number,
  unix: number
): void {
  const prev = map.get(imdbId)
  if (!prev) {
    map.set(imdbId, { maxSeeds: seeds, maxPeers: peers, latestUploadUnix: unix })
    return
  }
  map.set(imdbId, {
    maxSeeds: Math.max(prev.maxSeeds, seeds),
    maxPeers: Math.max(prev.maxPeers, peers),
    latestUploadUnix: Math.max(prev.latestUploadUnix, unix)
  })
}

/**
 * YTS `list_movies` (4 pages) + top TPB movie rows with IMDb + Knaben movie hits (150), all keyed by
 * IMDb so the same title across indexers reinforces swarm scores.
 */
export async function fetchMergedTrendingCandidates(
  signal?: AbortSignal
): Promise<MergedTrendingCandidate[]> {
  const ac = signal
  const byImdb = new Map<string, { maxSeeds: number; maxPeers: number; latestUploadUnix: number }>()

  const ytsList = await fetchYtsTrendingCandidates(ac)
  for (const c of ytsList) {
    mergeInto(byImdb, c.imdbId, c.maxSeeds, c.maxPeers, c.latestUploadUnix)
  }

  let tpbAll: TpbTrendingRow[] = []
  try {
    tpbAll = await fetchTpbMovieRowsWithImdb(ac)
  } catch {
    /* TPB optional when mirror is down */
  }

  const tpbForScores = tpbAll.slice(0, TPB_LIMIT)
  for (const r of tpbForScores) {
    mergeInto(byImdb, r.imdbId, r.seeders, r.leechers, r.addedUnix)
  }

  const imdbByHash = buildImdbByInfoHash(tpbAll)
  try {
    const knabenScores = await fetchKnabenTrendingByImdb(KNABEN_LIMIT, imdbByHash, ac)
    for (const k of knabenScores) {
      mergeInto(byImdb, k.imdbId, k.seeders, k.peers, k.latestUploadUnix)
    }
  } catch {
    /* Knaben optional: YTS + TPB still define the rail */
  }

  const candidates: MergedTrendingCandidate[] = [...byImdb.entries()].map(([imdbId, v]) => ({
    imdbId,
    ...v
  }))

  return candidates.sort((a, b) => aggregateScore(b) - aggregateScore(a))
}
