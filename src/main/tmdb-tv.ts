import { z } from 'zod'
import type { AppSettings } from '@shared/app-settings'
import type { TvListPage, TvSeasonDetails, TvShowDetails, TvShowListItem } from '@shared/tv'
import { getLibrary } from './library/db'
import { upsertShowDetails, upsertShowListRows } from './library/shows'
import { backdropUrl, posterUrl, tmdbFetchJson } from './tmdb'

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
  popularity: z.number().optional()
})

const tvListSchema = z.object({
  page: z.number().optional(),
  total_pages: z.number().optional(),
  total_results: z.number().optional(),
  results: z.array(tvRowSchema)
})

/** TMDB refuses pages past this. */
const TMDB_MAX_PAGE = 500

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
  rememberShowRows(parsed.data.results)
  const totalPages = Math.max(1, Math.min(TMDB_MAX_PAGE, parsed.data.total_pages ?? 1))
  return {
    results: parsed.data.results.map(mapTvRow),
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

function rememberShowRows(rows: z.infer<typeof tvRowSchema>[], imdbId?: string): void {
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
        imdbId: imdbId ?? null
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
  rememberShowRows([first], raw)
  return mapTvRow(first)
}

function mapTvRow(r: z.infer<typeof tvRowSchema>): TvShowListItem {
  return {
    id: r.id,
    name: r.name,
    firstAirYear: yearOf(r.first_air_date),
    posterUrl: posterUrl(r.poster_path ?? null, 'w185'),
    overview: r.overview ?? '',
    voteAverage: r.vote_average ?? null
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

export async function getTvShowDetails(settings: AppSettings, id: number): Promise<TvShowDetails> {
  const json = await tmdbFetchJson(
    settings,
    `/tv/${id}`,
    { append_to_response: 'external_ids' },
    { cacheTtlMs: 1000 * 60 * 60 * 6 }
  )
  const parsed = tvDetailsSchema.safeParse(json)
  if (!parsed.success) throw new Error('BAD_RESPONSE')
  const d = parsed.data
  try {
    upsertShowDetails(getLibrary(), {
      tmdbId: d.id,
      name: d.name,
      firstAirDate: d.first_air_date?.trim() || null,
      overview: d.overview ?? '',
      posterUrl: posterUrl(d.poster_path ?? null, 'w342'),
      imdbId: d.external_ids?.imdb_id ?? null,
      voteAverage: d.vote_average ?? null,
      voteCount: d.vote_count ?? null,
      popularity: d.popularity ?? null
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
  const json = await tmdbFetchJson(
    settings,
    `/tv/${showId}/season/${seasonNumber}`,
    {},
    { cacheTtlMs: 1000 * 60 * 60 * 6 }
  )
  const parsed = tvSeasonSchema.safeParse(json)
  if (!parsed.success) throw new Error('BAD_RESPONSE')
  return {
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
}
