import type { AppSettings } from '@shared/app-settings'
import { shouldIncludeCatalogListItem, type CatalogMovieListItem } from '@shared/catalog'
import { getLibrary, readLibraryMeta, writeLibraryMeta } from '../library/db'
import { rankMovies, recordTrendingSwarm, type TrendingSwarmRow } from '../library/ranked-lists'
import { enrichCatalogListWithOmdb } from '../omdb'
import { findMovieListItemByImdbId, getNowPlayingMovies } from '../tmdb'
import { mapWithConcurrency } from './map-with-concurrency'
import { fetchMergedTrendingCandidates } from './trending-candidates'

const REFRESH_MS = 24 * 60 * 60 * 1000
const REFRESHED_AT_KEY = 'trending_refreshed_at'
/** Max IMDb rows to resolve through TMDB per rebuild (cold-start budget). */
const MAX_TMDB_RESOLVE = 100
const TRENDING_LIMIT = 100
/** OMDb list enrichment only for this many leading rows (avoids long cold rebuilds). */
const OMDB_ENRICH_HEAD = 20

/** Parallel TMDB lookups during a rebuild; keeps order and stays under TMDB rate limits. */
const TMDB_CONCURRENCY = 8

/**
 * Pulls indexer swarm lists (YTS, TPB, Knaben) and TMDB now playing into the library.
 * TMDB list rows are saved by the TMDB helpers; swarm counts are saved here.
 */
async function refreshTrendingPool(settings: AppSettings): Promise<void> {
  let swarm: TrendingSwarmRow[] = []
  try {
    const candidates = (await fetchMergedTrendingCandidates()).slice(0, MAX_TMDB_RESOLVE)
    const items = await mapWithConcurrency(candidates, TMDB_CONCURRENCY, (c) =>
      findMovieListItemByImdbId(settings, c.imdbId).catch(() => null)
    )
    swarm = candidates.flatMap((c, i) => {
      const item = items[i]
      return item
        ? [
            {
              tmdbId: item.id,
              seeders: c.maxSeeds,
              peers: c.maxPeers,
              latestUploadUnix: Math.floor(c.latestUploadUnix)
            }
          ]
        : []
    })
  } catch {
    swarm = []
  }

  await getNowPlayingMovies(settings).catch(() => [])

  if (swarm.length > 0) {
    const now = Date.now()
    recordTrendingSwarm(getLibrary(), swarm, now)
    writeLibraryMeta(getLibrary(), REFRESHED_AT_KEY, String(now))
  }
}

export type GetTrendingWatchableOpts = {
  /** When true, re-query the indexers even if the last refresh is recent. */
  forceRefresh?: boolean
}

/**
 * Home "Trending" rail. Indexer swarms and TMDB lists are refreshed at most once a day;
 * the rail itself is always ranked fresh from the library.
 */
export async function getTrendingWatchableMovies(
  settings: AppSettings,
  opts?: GetTrendingWatchableOpts
): Promise<CatalogMovieListItem[]> {
  const refreshedAt = Number(readLibraryMeta(getLibrary(), REFRESHED_AT_KEY) ?? 0)
  if (opts?.forceRefresh === true || Date.now() - refreshedAt >= REFRESH_MS) {
    await refreshTrendingPool(settings)
  }

  let ranked = rankMovies(getLibrary(), { limit: TRENDING_LIMIT })
  if (ranked.length === 0) {
    ranked = await getNowPlayingMovies(settings)
  }

  const head = await enrichCatalogListWithOmdb(settings, ranked.slice(0, OMDB_ENRICH_HEAD))
  return [...head, ...ranked.slice(OMDB_ENRICH_HEAD)].filter(shouldIncludeCatalogListItem)
}
