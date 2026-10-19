import { z } from 'zod'
import type { AppSettings } from '@shared/app-settings'
import type {
  TvGenre,
  TvListPage,
  TvSeasonDetails,
  TvShowDetails,
  TvShowListItem
} from '@shared/tv'
import { getLibrary } from './library/db'
import { upsertShowDetails, upsertShowListRows, readStoredShowDetails } from './library/shows'
import { readStoredTvSeason, saveTvSeason } from './library/tv-episodes'
import { isDetailsFresh } from './catalog-fresh'
import {
  backdropUrl,
  filterTrailersToLandscape,
  pickTrailerCandidatesFromVideos,
  posterUrl,
  tmdbFetchJson
} from './tmdb'
import { hydrateFromTorrentClaw, hydrateSeasonFromTorrentClaw } from './torrentclaw/discovery'

const yearOf = (date: string | null | undefined): number | null => {
  const y = date && /^\d{4}/.test(date) ? Number.parseInt(date.slice(0, 4), 10) : NaN
  return Number.isFinite(y) ? y : null
}

const tvRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  first_air_date: z.string().nullable().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  popularity: z.number().optional(),
  genre_ids: z.array(z.number()).optional()
})

const tvGenreListSchema = z.object({
  genres: z.array(z.object({ id: z.number(), name: z.string() }))
})

let tvGenreNames: Map<number, string> | null = null
let tvGenresInflight: Promise<TvGenre[]> | null = null

/** TMDB's TV genres (they differ from movie genres, e.g. "Sci-Fi & Fantasy"). Cached a week. */
export async function getTvGenres(settings: AppSettings): Promise<TvGenre[]> {
  tvGenresInflight ??= (async (): Promise<TvGenre[]> => {
    const json = await tmdbFetchJson(
      settings,
      '/genre/tv/list',
      {},
      { cacheTtlMs: 1000 * 60 * 60 * 24 * 7 }
    )
    const parsed = tvGenreListSchema.safeParse(json)
    if (!parsed.success) throw new Error('BAD_RESPONSE')
    tvGenreNames = new Map(parsed.data.genres.map((g) => [g.id, g.name]))
    return parsed.data.genres
  })().finally(() => {
    tvGenresInflight = null
  })
  return tvGenresInflight
}

async function ensureTvGenreNames(settings: AppSettings): Promise<Map<number, string>> {
  if (tvGenreNames) return tvGenreNames
  try {
    await getTvGenres(settings)
  } catch (error) {
    console.warn('Could not load TMDB TV genres', error)
  }
  return tvGenreNames ?? new Map()
}

function genreNamesFor(ids: number[] | undefined, names: Map<number, string>): string[] {
  return [...new Set((ids ?? []).flatMap((id) => names.get(id) ?? []))]
}

const tvListSchema = z.object({
  page: z.number().optional(),
  total_pages: z.number().optional(),
  total_results: z.number().optional(),
  results: z.array(tvRowSchema)
})

/** TMDB refuses pages past this. */
const TMDB_MAX_PAGE = 500
const SEARCH_MAX_PAGES = 15

function clampPage(page: number): number {
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(TMDB_MAX_PAGE, Math.floor(page))
}

async function fetchTvList(
  settings: AppSettings,
  path: string,
  params: Record<string, string>,
  page: number,
  cacheTtlMs: number
): Promise<TvListPage> {
  const json = await tmdbFetchJson(
    settings,
    path,
    { ...params, page: String(clampPage(page)) },
    { cacheTtlMs }
  )
  const parsed = tvListSchema.safeParse(json)
  if (!parsed.success) throw new Error('BAD_RESPONSE')
  const names = await ensureTvGenreNames(settings)
  rememberShowRows(parsed.data.results, names)
  const totalPages = Math.max(1, Math.min(TMDB_MAX_PAGE, parsed.data.total_pages ?? 1))
  return {
    results: parsed.data.results.map((r) => mapTvRow(r, names)),
    page: parsed.data.page ?? clampPage(page),
    totalPages,
    totalResults: Math.max(0, parsed.data.total_results ?? parsed.data.results.length)
  }
}

export async function searchTvShows(
  settings: AppSettings,
  query: string,
  page = 1
): Promise<TvListPage> {
  return fetchTvList(
    settings,
    '/search/tv',
    { query: query.trim(), include_adult: 'false' },
    page,
    1000 * 60 * 30
  )
}

/** Every TMDB result for a query (up to 15 pages of 20), for pages of 24 in the browser. */
export async function searchTvShowsAll(
  settings: AppSettings,
  query: string
): Promise<TvShowListItem[]> {
  const out: TvShowListItem[] = []
  const seen = new Set<number>()
  let totalPages = 1
  for (let page = 1; page <= totalPages && page <= SEARCH_MAX_PAGES; page++) {
    const res = await searchTvShows(settings, query, page)
    totalPages = res.totalPages
    for (const show of res.results) {
      if (seen.has(show.id)) continue
      seen.add(show.id)
      out.push(show)
    }
    if (res.results.length === 0) break
  }
  return out
}

/** Shows with an episode airing in the next seven days (TMDB "on the air"). */
export async function getOnTheAirShows(settings: AppSettings): Promise<TvShowListItem[]> {
  const pages = await Promise.all(
    [1, 2].map((page) => fetchTvList(settings, '/tv/on_the_air', {}, page, 1000 * 60 * 60))
  )
  const seen = new Set<number>()
  return pages
    .flatMap((p) => p.results)
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

/** One page of a genre, most popular first. */
export async function discoverTvByGenre(
  settings: AppSettings,
  genreId: number,
  page: number
): Promise<TvListPage> {
  return fetchTvList(
    settings,
    '/discover/tv',
    { with_genres: String(genreId), sort_by: 'popularity.desc', include_adult: 'false' },
    page,
    1000 * 60 * 60
  )
}

function rememberShowRows(
  rows: z.infer<typeof tvRowSchema>[],
  genreNames: Map<number, string>,
  imdbId?: string
): void {
  try {
    upsertShowListRows(
      getLibrary(),
      rows.map((r) => ({
        tmdbId: r.id,
        name: r.name,
        firstAirDate: r.first_air_date?.trim() || null,
        overview: r.overview ?? '',
        posterUrl: posterUrl(r.poster_path ?? null, 'w185'),
        voteAverage: r.vote_average ?? null,
        voteCount: r.vote_count ?? null,
        popularity: r.popularity ?? null,
        imdbId: imdbId ?? null,
        genres: genreNamesFor(r.genre_ids, genreNames)
      }))
    )
  } catch (error) {
    console.error('Could not save TMDB shows to the library', error)
  }
}

const findTvResponseSchema = z.object({
  tv_results: z.array(tvRowSchema).optional()
})

/** Resolve a TMDB show from its IMDb id (`tt…`). Returns null when TMDB has no TV match. */
export async function findTvShowByImdbId(
  settings: AppSettings,
  imdbId: string
): Promise<TvShowListItem | null> {
  const raw = imdbId.trim().toLowerCase()
  if (!/^tt\d+$/u.test(raw)) return null
  const json = await tmdbFetchJson(
    settings,
    `/find/${encodeURIComponent(raw)}`,
    { external_source: 'imdb_id' },
    { cacheTtlMs: 1000 * 60 * 60 * 24 }
  )
  const parsed = findTvResponseSchema.safeParse(json)
  const first = parsed.success ? parsed.data.tv_results?.[0] : undefined
  if (!first) return null
  const names = await ensureTvGenreNames(settings)
  rememberShowRows([first], names, raw)
  return mapTvRow(first, names)
}

function mapTvRow(r: z.infer<typeof tvRowSchema>, genreNames: Map<number, string>): TvShowListItem {
  return {
    id: r.id,
    name: r.name,
    firstAirYear: yearOf(r.first_air_date),
    posterUrl: posterUrl(r.poster_path ?? null, 'w185'),
    overview: r.overview ?? '',
    voteAverage: r.vote_average ?? null,
    genres: genreNamesFor(r.genre_ids, genreNames)
  }
}

/** One page of TMDB's popular TV list. */
export async function getPopularTvShows(settings: AppSettings, page = 1): Promise<TvListPage> {
  return fetchTvList(settings, '/tv/popular', {}, page, 1000 * 60 * 60)
}

const tvDetailsSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string().nullable().optional(),
  first_air_date: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  popularity: z.number().optional(),
  external_ids: z.object({ imdb_id: z.string().nullable().optional() }).optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  status: z.string().nullable().optional(),
  number_of_seasons: z.number().nullable().optional(),
  last_air_date: z.string().nullable().optional(),
  last_episode_to_air: z
    .object({ air_date: z.string().nullable().optional() })
    .nullable()
    .optional(),
  credits: z
    .object({
      cast: z.array(
        z.object({
          name: z.string(),
          character: z.string().nullable().optional(),
          profile_path: z.string().nullable().optional()
        })
      )
    })
    .optional(),
  videos: z
    .object({
      results: z
        .array(
          z.object({
            key: z.string(),
            name: z.string(),
            site: z.string(),
            type: z.string(),
            official: z.boolean().optional()
          })
        )
        .optional()
    })
    .optional(),
  seasons: z
    .array(
      z.object({
        season_number: z.number(),
        name: z.string(),
        episode_count: z.number().optional(),
        air_date: z.string().nullable().optional()
      })
    )
    .optional()
})

export async function getTvShowDetails(
  settings: AppSettings,
  id: number,
  opts?: { forceRefresh?: boolean }
): Promise<TvShowDetails> {
  const db = getLibrary()
  if (!opts?.forceRefresh) {
    const stored = readStoredShowDetails(db, id)
    if (
      stored &&
      stored.extrasStored &&
      isDetailsFresh(stored.detailsAt) &&
      stored.details.seasons.length > 0
    ) {
      return stored.details
    }
  }
  try {
    return await fetchTvShowDetailsFromTmdb(settings, id)
  } catch (error) {
    const stored = readStoredShowDetails(db, id)
    if (stored && isDetailsFresh(stored.detailsAt) && stored.details.seasons.length > 0) {
      return stored.details
    }
    const hydrated = await hydrateFromTorrentClaw(db, id, 'show').catch(() => false)
    if (hydrated) {
      const again = readStoredShowDetails(db, id)
      if (again) return again.details
    }
    if (stored) return stored.details
    throw error
  }
}

async function fetchTvShowDetailsFromTmdb(
  settings: AppSettings,
  id: number
): Promise<TvShowDetails> {
  const json = await tmdbFetchJson(
    settings,
    `/tv/${id}`,
    { append_to_response: 'external_ids,credits,videos' },
    { cacheTtlMs: 1000 * 60 * 60 * 6 }
  )
  const parsed = tvDetailsSchema.safeParse(json)
  if (!parsed.success) throw new Error('BAD_RESPONSE')
  const d = parsed.data
  const cast = (d.credits?.cast ?? []).slice(0, 12).map((person) => ({
    name: person.name,
    character: person.character ?? '',
    profileUrl: posterUrl(person.profile_path ?? null, 'w185')
  }))
  const trailers = await filterTrailersToLandscape(
    pickTrailerCandidatesFromVideos(d.videos?.results)
  )
  try {
    upsertShowDetails(getLibrary(), {
      tmdbId: d.id,
      name: d.name,
      firstAirDate: d.first_air_date?.trim() || null,
      overview: d.overview ?? '',
      posterUrl: posterUrl(d.poster_path ?? null, 'w342'),
      backdropUrl: backdropUrl(d.backdrop_path ?? null),
      imdbId: d.external_ids?.imdb_id ?? null,
      voteAverage: d.vote_average ?? null,
      voteCount: d.vote_count ?? null,
      popularity: d.popularity ?? null,
      seasons: (d.seasons ?? [])
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          seasonNumber: s.season_number,
          name: s.name,
          episodeCount: s.episode_count ?? 0,
          airYear: yearOf(s.air_date)
        })),
      facts: {
        genres: (d.genres ?? []).map((g) => g.name),
        seasonCount:
          d.number_of_seasons ??
          ((d.seasons ?? []).filter((s) => s.season_number > 0).length || null),
        tmdbStatus: d.status?.trim() || null,
        lastAirDate: d.last_air_date?.trim() || null,
        lastEpisodeAirDate: d.last_episode_to_air?.air_date?.trim() || null
      },
      cast,
      trailers
    })
  } catch (error) {
    console.error('Could not save TMDB show details to the library', error)
  }
  return {
    id: d.id,
    name: d.name,
    overview: d.overview ?? '',
    firstAirYear: yearOf(d.first_air_date),
    posterUrl: posterUrl(d.poster_path ?? null, 'w342'),
    backdropUrl: backdropUrl(d.backdrop_path ?? null),
    imdbId: d.external_ids?.imdb_id ?? null,
    cast,
    trailers,
    seasons: (d.seasons ?? [])
      .filter((s) => s.season_number > 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count ?? 0,
        airYear: yearOf(s.air_date)
      }))
  }
}

const tvSeasonSchema = z.object({
  episodes: z.array(
    z.object({
      id: z.number(),
      season_number: z.number(),
      episode_number: z.number(),
      name: z.string(),
      overview: z.string().nullable().optional(),
      air_date: z.string().nullable().optional(),
      runtime: z.number().nullable().optional(),
      still_path: z.string().nullable().optional()
    })
  )
})

export async function getTvSeason(
  settings: AppSettings,
  showId: number,
  seasonNumber: number
): Promise<TvSeasonDetails> {
  const stored = readStoredTvSeason(getLibrary(), showId, seasonNumber)
  if (stored && stored.episodes.length > 0) return stored
  try {
    const json = await tmdbFetchJson(
      settings,
      `/tv/${showId}/season/${seasonNumber}`,
      {},
      { cacheTtlMs: 1000 * 60 * 60 * 6 }
    )
    const parsed = tvSeasonSchema.safeParse(json)
    if (!parsed.success) throw new Error('BAD_RESPONSE')
    const season: TvSeasonDetails = {
      showId,
      seasonNumber,
      episodes: parsed.data.episodes.map((e) => ({
        id: e.id,
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name,
        overview: e.overview ?? '',
        airDate: e.air_date ?? null,
        runtime: e.runtime ?? null,
        stillUrl: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : null
      }))
    }
    saveTvSeason(getLibrary(), season)
    return season
  } catch (error) {
    if (stored) return stored
    const fromTc = await hydrateSeasonFromTorrentClaw(getLibrary(), showId, seasonNumber).catch(
      () => null
    )
    if (fromTc && fromTc.episodes.length > 0) return fromTc
    throw error
  }
}
