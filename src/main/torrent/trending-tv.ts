import type { AppSettings } from '@shared/app-settings'
import { hasListPosterUrl, hasMeaningfulListOverview } from '@shared/catalog'
import type { TvShowListItem } from '@shared/tv'
import { getLibrary, readLibraryMeta, writeLibraryMeta } from '../library/db'
import type { TrendingSwarmRow } from '../library/ranked-lists'
import { rankShows, recordShowSwarm } from '../library/shows'
import { findTvShowByImdbId, getPopularTvShows } from '../tmdb-tv'
import { fetchPopularSwarm, getPopularShowsPage } from '../torrentclaw/discovery'
import { mapWithConcurrency } from './map-with-concurrency'
import { TrendingPager, type TrendingPageResult, type TrendingPageSource } from './trending-pager'
import { fetchMergedTvTrendingCandidates } from './tv-trending-candidates'

const REFRESH_MS = 24 * 60 * 60 * 1000
const REFRESHED_AT_KEY = 'tv_trending_refreshed_at'
const MAX_TMDB_RESOLVE = 100
const TMDB_CONCURRENCY = 8
/** TMDB popular pages pulled into the pool on each refresh (20 shows each). */
const TMDB_POPULAR_PAGES = 10
/** Ranked head of the endless list (about four pages). */
const TRENDING_HEAD = 100
/** Must match `CATALOG_LIST_PAGE_SIZE` in the renderer. */
const PAGE_SIZE = 24
/** TorrentClaw popular pages 1-4 feed the ranked head; the tail continues after them. */
const TC_TAIL_FIRST_PAGE = 5
const FAILED_REFRESH_RETRY_MS = 10 * 60 * 1000

let refreshInFlight: Promise<void> | null = null
let lastRefreshAttemptAt = 0
let pagerState: { key: string; pager: TrendingPager<TvShowListItem> } | null = null

/** Indexer swarm lists resolved through TMDB. Used when TorrentClaw is down. */
async function indexerTvSwarm(settings: AppSettings): Promise<TrendingSwarmRow[]> {
  const candidates = (await fetchMergedTvTrendingCandidates()).slice(0, MAX_TMDB_RESOLVE)
  const shows = await mapWithConcurrency(candidates, TMDB_CONCURRENCY, (c) =>
    findTvShowByImdbId(settings, c.imdbId).catch(() => null)
  )
  return candidates.flatMap((c, i) => {
    const show = shows[i]
    return show
      ? [
          {
            tmdbId: show.id,
            seeders: c.maxSeeds,
            peers: c.maxPeers,
            latestUploadUnix: Math.floor(c.latestUploadUnix)
          }
        ]
      : []
  })
}

async function refreshTvPool(settings: AppSettings): Promise<void> {
  let swarm: TrendingSwarmRow[] = []
  try {
    swarm = await fetchPopularSwarm(getLibrary(), 'show')
  } catch (error) {
    console.warn('TorrentClaw popular unavailable; using indexer TV trending', error)
  }
  if (swarm.length === 0) {
    swarm = await indexerTvSwarm(settings).catch(() => [])
  }

  for (let page = 1; page <= TMDB_POPULAR_PAGES; page++) {
    await getPopularTvShows(settings, page).catch(() => null)
  }

  if (swarm.length > 0) {
    const now = Date.now()
    recordShowSwarm(getLibrary(), swarm, now)
    writeLibraryMeta(getLibrary(), REFRESHED_AT_KEY, String(now))
  }
}

function shouldIncludeShow(show: TvShowListItem): boolean {
  return hasListPosterUrl(show.posterUrl) || hasMeaningfulListOverview(show.overview)
}

function tvTailSources(
  settings: AppSettings,
  tcFirstPage: number
): TrendingPageSource<TvShowListItem>[] {
  return [
    {
      name: 'TorrentClaw popular shows',
      firstPage: tcFirstPage,
      load: async (page) => {
        const res = await getPopularShowsPage(getLibrary(), page)
        return { items: res.items.filter(shouldIncludeShow), done: res.done }
      }
    },
    {
      name: 'TMDB popular TV',
      firstPage: 1,
      load: async (page) => {
        const res = await getPopularTvShows(settings, page)
        return { items: res.results.filter(shouldIncludeShow), done: page >= res.totalPages }
      }
    }
  ]
}

/**
 * TV "Trending", one page at a time with no fixed end. Swarms and TMDB popular are refreshed at
 * most once a day; the first ~100 shows are ranked from the library with the same score as
 * movies, and deeper pages come from TorrentClaw popular, then TMDB popular.
 */
export async function getTrendingTvPage(
  settings: AppSettings,
  page: number,
  opts?: { forceRefresh?: boolean }
): Promise<TrendingPageResult<TvShowListItem>> {
  const force = opts?.forceRefresh === true
  const refreshedAt = Number(readLibraryMeta(getLibrary(), REFRESHED_AT_KEY) ?? 0)
  const stale = Date.now() - refreshedAt >= REFRESH_MS
  // A failed refresh records nothing, so without this every page turn would retry it.
  const retryDue = Date.now() - lastRefreshAttemptAt >= FAILED_REFRESH_RETRY_MS
  if (force || (stale && retryDue)) {
    lastRefreshAttemptAt = Date.now()
    refreshInFlight ??= refreshTvPool(settings).finally(() => {
      refreshInFlight = null
    })
    await refreshInFlight
  }

  const key = readLibraryMeta(getLibrary(), REFRESHED_AT_KEY) ?? 'never'
  if (force || !pagerState || pagerState.key !== key) {
    const head = rankShows(getLibrary(), { limit: TRENDING_HEAD }).filter(shouldIncludeShow)
    // With no ranked head (cold library), TorrentClaw's own first pages lead the list.
    const sources = tvTailSources(settings, head.length > 0 ? TC_TAIL_FIRST_PAGE : 1)
    pagerState = { key, pager: new TrendingPager(head, sources, PAGE_SIZE) }
  }
  return pagerState.pager.page(page)
}
