import type { AppSettings } from '@shared/app-settings'
import { shouldIncludeCatalogListItem, type CatalogMovieListItem } from '@shared/catalog'
import { getLibrary, readLibraryMeta, writeLibraryMeta } from '../library/db'
import { rankMovies, recordTrendingSwarm, type TrendingSwarmRow } from '../library/ranked-lists'
import { enrichCatalogListWithOmdb } from '../omdb'
import {
  findMovieListItemByImdbId,
  getNowPlayingMovies,
  getPopularMoviesPage as getTmdbPopularPage
} from '../tmdb'
import {
  fetchPopularSwarm,
  getPopularMoviesPage as getTorrentClawPopularPage
} from '../torrentclaw/discovery'
import { mapWithConcurrency } from './map-with-concurrency'
import { fetchMergedTrendingCandidates } from './trending-candidates'
import { TrendingPager, type TrendingPageResult, type TrendingPageSource } from './trending-pager'

const REFRESH_MS = 24 * 60 * 60 * 1000
const REFRESHED_AT_KEY = 'trending_refreshed_at'
/** Max IMDb rows to resolve through TMDB per rebuild (cold-start budget). */
const MAX_TMDB_RESOLVE = 100
const TRENDING_LIMIT = 100
/** Must match `CATALOG_LIST_PAGE_SIZE` in the renderer. */
const TRENDING_PAGE_SIZE = 24
/** OMDb list enrichment only for this many leading rows (avoids long cold rebuilds). */
const OMDB_ENRICH_HEAD = 20

/** Parallel TMDB lookups during a rebuild; keeps order and stays under TMDB rate limits. */
const TMDB_CONCURRENCY = 8

/** Indexer swarm lists (YTS, TPB, Knaben) resolved through TMDB. Used when TorrentClaw is down. */
async function indexerSwarm(settings: AppSettings): Promise<TrendingSwarmRow[]> {
  const candidates = (await fetchMergedTrendingCandidates()).slice(0, MAX_TMDB_RESOLVE)
  const items = await mapWithConcurrency(candidates, TMDB_CONCURRENCY, (c) =>
    findMovieListItemByImdbId(settings, c.imdbId).catch(() => null)
  )
  return candidates.flatMap((c, i) => {
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
}

/**
 * Pulls swarm counts (TorrentClaw popular, falling back to YTS/TPB/Knaben) and TMDB now playing
 * into the library. TMDB list rows are saved by the TMDB helpers; swarm counts are saved here.
 */
async function refreshTrendingPool(settings: AppSettings): Promise<void> {
  let swarm: TrendingSwarmRow[] = []
  try {
    swarm = await fetchPopularSwarm(getLibrary(), 'movie')
  } catch (error) {
    console.warn('TorrentClaw popular unavailable; using indexer trending', error)
  }
  if (swarm.length === 0) {
    swarm = await indexerSwarm(settings).catch(() => [])
  }

  await getNowPlayingMovies(settings).catch(() => [])

  if (swarm.length > 0) {
    const now = Date.now()
    recordTrendingSwarm(getLibrary(), swarm, now)
    writeLibraryMeta(getLibrary(), REFRESHED_AT_KEY, String(now))
  }
}

export type GetTrendingWatchableOpts = {
  /** When true, re-query the sources even if the last refresh is recent. */
  forceRefresh?: boolean
}

/** Ranked head of the Trending list, ranked fresh from the library. */
async function rankedTrendingHead(settings: AppSettings): Promise<CatalogMovieListItem[]> {
  let ranked = rankMovies(getLibrary(), { limit: TRENDING_LIMIT })
  if (ranked.length === 0) {
    ranked = await getNowPlayingMovies(settings)
  }

  const head = await enrichCatalogListWithOmdb(settings, ranked.slice(0, OMDB_ENRICH_HEAD))
  return [...head, ...ranked.slice(OMDB_ENRICH_HEAD)].filter(shouldIncludeCatalogListItem)
}

/** TorrentClaw popular pages 1-4 feed the ranked head; the endless tail continues after them. */
const TC_TAIL_FIRST_PAGE = 5

function trendingTailSources(settings: AppSettings): TrendingPageSource[] {
  return [
    {
      name: 'TorrentClaw popular',
      firstPage: TC_TAIL_FIRST_PAGE,
      load: async (page) => {
        const res = await getTorrentClawPopularPage(getLibrary(), page)
        return { items: res.items.filter(shouldIncludeCatalogListItem), done: res.done }
      }
    },
    {
      name: 'TMDB popular',
      firstPage: 1,
      load: async (page) => {
        const res = await getTmdbPopularPage(settings, page)
        return {
          items: res.results.filter(shouldIncludeCatalogListItem),
          done: page >= res.totalPages
        }
      }
    }
  ]
}

let pagerState: { key: string; pager: TrendingPager } | null = null
let refreshInFlight: Promise<void> | null = null
let lastRefreshAttemptAt = 0
const FAILED_REFRESH_RETRY_MS = 10 * 60 * 1000

/**
 * Home "Trending", one page at a time with no fixed end. Swarms and TMDB lists are refreshed at
 * most once a day; the first ~100 titles are ranked from the library, and deeper pages come from
 * TorrentClaw popular, then TMDB popular.
 */
export async function getTrendingPage(
  settings: AppSettings,
  page: number,
  opts?: GetTrendingWatchableOpts
): Promise<TrendingPageResult> {
  const force = opts?.forceRefresh === true
  const refreshedAt = Number(readLibraryMeta(getLibrary(), REFRESHED_AT_KEY) ?? 0)
  const stale = Date.now() - refreshedAt >= REFRESH_MS
  // A failed refresh records nothing, so without this every page turn would retry it.
  const retryDue = Date.now() - lastRefreshAttemptAt >= FAILED_REFRESH_RETRY_MS
  if (force || (stale && retryDue)) {
    lastRefreshAttemptAt = Date.now()
    refreshInFlight ??= refreshTrendingPool(settings).finally(() => {
      refreshInFlight = null
    })
    await refreshInFlight
  }

  const key = readLibraryMeta(getLibrary(), REFRESHED_AT_KEY) ?? 'never'
  if (force || !pagerState || pagerState.key !== key) {
    const head = await rankedTrendingHead(settings)
    pagerState = {
      key,
      pager: new TrendingPager(head, trendingTailSources(settings), TRENDING_PAGE_SIZE)
    }
  }
  return pagerState.pager.page(page)
}
