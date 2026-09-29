import type { AppSettings } from '@shared/app-settings'
import { hasListPosterUrl } from '@shared/catalog'
import type { TvGenreRail, TvShowListItem } from '@shared/tv'
import { getLibrary } from './library/db'
import { rankShows } from './library/shows'
import { discoverTvByGenre, getTvGenres } from './tmdb-tv'
import { TrendingPager, type TrendingPageResult } from './torrent/trending-pager'

const RAIL_MAX = 15
/** Must match `CATALOG_LIST_PAGE_SIZE` in the renderer. */
const PAGE_SIZE = 24
/** Genre pagers kept in memory (most recently used). */
const MAX_PAGERS = 6
const PAGER_TTL_MS = 60 * 60 * 1000

/** One rail per TMDB TV genre: the most popular shows that have a poster. */
export async function getTvGenreRails(settings: AppSettings): Promise<TvGenreRail[]> {
  let genres: { id: number; name: string }[] = []
  try {
    genres = await getTvGenres(settings)
  } catch {
    const ranked = rankShows(getLibrary(), { limit: 45 }).filter((s) => hasListPosterUrl(s.posterUrl))
    return ranked.length > 0 ? [{ genre: { id: 0, name: 'Popular' }, shows: ranked.slice(0, RAIL_MAX) }] : []
  }
  const rails = await Promise.all(
    genres.map(async (genre) => {
      try {
        const page = await discoverTvByGenre(settings, genre.id, 1)
        const shows = page.results.filter((s) => hasListPosterUrl(s.posterUrl)).slice(0, RAIL_MAX)
        return shows.length > 0 ? { genre, shows } : null
      } catch {
        return null
      }
    })
  )
  const filled = rails.filter((r): r is TvGenreRail => r != null)
  if (filled.length > 0) return filled
  const ranked = rankShows(getLibrary(), { limit: 45 }).filter((s) => hasListPosterUrl(s.posterUrl))
  return ranked.length > 0 ? [{ genre: { id: 0, name: 'Popular' }, shows: ranked.slice(0, RAIL_MAX) }] : []
}

const pagers = new Map<number, { pager: TrendingPager<TvShowListItem>; createdAt: number }>()

function genrePager(settings: AppSettings, genreId: number): TrendingPager<TvShowListItem> {
  const existing = pagers.get(genreId)
  if (existing && Date.now() - existing.createdAt < PAGER_TTL_MS) {
    // Re-insert so the map stays in least-recently-used order.
    pagers.delete(genreId)
    pagers.set(genreId, existing)
    return existing.pager
  }
  const pager = new TrendingPager<TvShowListItem>(
    [],
    [
      {
        name: `TMDB discover genre ${genreId}`,
        firstPage: 1,
        load: async (page) => {
          const res = await discoverTvByGenre(settings, genreId, page)
          return {
            items: res.results.filter((s) => hasListPosterUrl(s.posterUrl)),
            done: page >= res.totalPages
          }
        }
      }
    ],
    PAGE_SIZE
  )
  pagers.set(genreId, { pager, createdAt: Date.now() })
  while (pagers.size > MAX_PAGERS) {
    const oldest = pagers.keys().next().value
    if (oldest === undefined) break
    pagers.delete(oldest)
  }
  return pager
}

/** 24-show pages of a genre, built from TMDB's 20-row discover pages (up to 500 of them). */
export function getTvGenrePage(
  settings: AppSettings,
  genreId: number,
  page: number
): Promise<TrendingPageResult<TvShowListItem>> {
  return genrePager(settings, genreId).page(page)
}
