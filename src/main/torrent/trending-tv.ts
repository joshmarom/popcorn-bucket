import type { AppSettings } from '@shared/app-settings'
import { hasListPosterUrl, hasMeaningfulListOverview } from '@shared/catalog'
import type { TvListPage, TvShowListItem } from '@shared/tv'
import { getLibrary, readLibraryMeta, writeLibraryMeta } from '../library/db'
import type { TrendingSwarmRow } from '../library/ranked-lists'
import { rankShows, recordShowSwarm } from '../library/shows'
import { findTvShowByImdbId, getPopularTvShows } from '../tmdb-tv'
import { mapWithConcurrency } from './map-with-concurrency'
import { fetchMergedTvTrendingCandidates } from './tv-trending-candidates'

const REFRESH_MS = 24 * 60 * 60 * 1000
const REFRESHED_AT_KEY = 'tv_trending_refreshed_at'
const MAX_TMDB_RESOLVE = 100
const TMDB_CONCURRENCY = 8
/** TMDB popular pages pulled into the pool on each refresh (20 shows each). */
const TMDB_POPULAR_PAGES = 10
const TRENDING_LIMIT = 300
const PAGE_SIZE = 20

let refreshInFlight: Promise<void> | null = null

async function refreshTvPool(settings: AppSettings): Promise<void> {
  let swarm: TrendingSwarmRow[] = []
  try {
    const candidates = (await fetchMergedTvTrendingCandidates()).slice(0, MAX_TMDB_RESOLVE)
    const shows = await mapWithConcurrency(candidates, TMDB_CONCURRENCY, (c) =>
      findTvShowByImdbId(settings, c.imdbId).catch(() => null)
    )
    swarm = candidates.flatMap((c, i) => {
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
  } catch {
    swarm = []
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

/**
 * TV "Trending": indexer swarms and TMDB popular are refreshed at most once a day, and the list is
 * ranked from the library with the same score as movies. Pages are 20 shows, like TMDB's.
 */
export async function getTrendingTvPage(settings: AppSettings, page: number): Promise<TvListPage> {
  const refreshedAt = Number(readLibraryMeta(getLibrary(), REFRESHED_AT_KEY) ?? 0)
  if (Date.now() - refreshedAt >= REFRESH_MS) {
    refreshInFlight ??= refreshTvPool(settings).finally(() => {
      refreshInFlight = null
    })
    await refreshInFlight
  }

  const ranked = rankShows(getLibrary(), { limit: TRENDING_LIMIT }).filter(shouldIncludeShow)
  if (ranked.length === 0) return getPopularTvShows(settings, page)

  const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE))
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages)
  return {
    results: ranked.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    page: current,
    totalPages,
    totalResults: ranked.length
  }
}
