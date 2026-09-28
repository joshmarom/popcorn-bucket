import { createHash } from 'crypto'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { z } from 'zod'
import type { AppSettings } from '@shared/app-settings'
import type {
  CatalogCastMember,
  CatalogMovieDetails,
  CatalogMovieListItem,
  CatalogTrailer
} from '@shared/catalog'
import { getLibrary } from './library/db'
import {
  genreNameById,
  runtimesByMovieId,
  upsertGenres,
  upsertMovie,
  upsertMovieListRows
} from './library/movies'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

export function posterUrl(
  path: string | null | undefined,
  size: 'w185' | 'w342' | 'w500' = 'w185'
): string | null {
  const p = typeof path === 'string' ? path.trim() : path
  if (!p) return null
  return `${IMAGE_BASE}/${size}${p}`
}

export function backdropUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `${IMAGE_BASE}/w1280${path}`
}

const searchMovieResultRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  overview: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  popularity: z.number().optional(),
  genre_ids: z.array(z.number()).optional()
})

const searchResponseSchema = z.object({
  page: z.number().optional(),
  total_pages: z.number().optional(),
  results: z.array(searchMovieResultRowSchema)
})

/** TMDB caps at 20 rows per page; cap total pages to limit latency and API load. */
const SEARCH_MOVIE_MAX_PAGES = 15

const DISCOVER_GENRE_MAX_PAGES = 15

const genreListSchema = z.object({
  genres: z.array(
    z.object({
      id: z.number(),
      name: z.string()
    })
  )
})

const castSchema = z.object({
  cast: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      character: z.string(),
      profile_path: z.string().nullable().optional()
    })
  )
})

const movieVideosSchema = z.object({
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

const movieDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  tagline: z.string().optional(),
  overview: z.string().nullable().optional(),
  runtime: z.number().nullable().optional(),
  release_date: z.string().nullable().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  popularity: z.number().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  credits: castSchema.optional(),
  videos: movieVideosSchema.optional(),
  external_ids: z
    .object({
      imdb_id: z.string().nullable().optional()
    })
    .optional()
})

let lastFetchAt = 0
const MIN_INTERVAL_MS = 45

async function throttle(): Promise<void> {
  const now = Date.now()
  const wait = lastFetchAt + MIN_INTERVAL_MS - now
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait))
  }
  lastFetchAt = Date.now()
}

function buildUrl(path: string, query: Record<string, string>): string {
  const u = new URL(`${TMDB_BASE}${path}`)
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v)
  }
  return u.toString()
}

async function readCache<T>(key: string): Promise<T | null> {
  const dir = join(app.getPath('userData'), 'tmdb-cache')
  const file = join(dir, `${key}.json`)
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as { exp: number; data: T }
    if (parsed.exp < Date.now()) return null
    return parsed.data
  } catch {
    return null
  }
}

async function writeCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const dir = join(app.getPath('userData'), 'tmdb-cache')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${key}.json`)
  const payload = JSON.stringify({ exp: Date.now() + ttlMs, data })
  await writeFile(file, payload, 'utf8')
}

function cacheKey(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/**
 * YouTube often ships hq thumbnails at 480×360 (4:3), even for 16:9 videos — so the threshold
 * must stay below 4:3 (~1.33). Portrait thumbs are usually clearly tall (ratio well under 1.2).
 */
const YOUTUBE_LANDSCAPE_MIN_RATIO = 1.28
const YOUTUBE_PORTRAIT_MAX_RATIO = 1.12

type OembedAspectVerdict = 'landscape' | 'portrait' | 'unknown'

async function youtubeOEmbedAspectVerdict(youtubeKey: string): Promise<OembedAspectVerdict> {
  const k = youtubeKey.trim()
  if (!k) return 'unknown'
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(k)}`
  const oembed = new URL('https://www.youtube.com/oembed')
  oembed.searchParams.set('url', watch)
  oembed.searchParams.set('format', 'json')

  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(oembed.toString(), {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PopcornBucket/1.0 (movie trailer filter; +https://github.com/)'
      }
    })
    if (!res.ok) return 'unknown'
    const j = (await res.json()) as {
      width?: number
      height?: number
      thumbnail_width?: number
      thumbnail_height?: number
    }
    const ratios: number[] = []
    const tw = j.thumbnail_width
    const th = j.thumbnail_height
    if (typeof tw === 'number' && typeof th === 'number' && th > 0) {
      ratios.push(tw / th)
    }
    const w = j.width
    const h = j.height
    if (typeof w === 'number' && typeof h === 'number' && h > 0) {
      ratios.push(w / h)
    }
    if (ratios.length === 0) return 'unknown'
    const best = Math.max(...ratios)
    const worst = Math.min(...ratios)
    if (worst <= YOUTUBE_PORTRAIT_MAX_RATIO) return 'portrait'
    if (best >= YOUTUBE_LANDSCAPE_MIN_RATIO) return 'landscape'
    return 'unknown'
  } catch {
    return 'unknown'
  } finally {
    clearTimeout(tid)
  }
}

function nameLooksLikeVerticalTrailer(name: string): boolean {
  const n = name.toLowerCase()
  if (/\bshorts\b/.test(n)) return true
  if (/\breels?\b/.test(n)) return true
  if (/(^|\s)vertical(\s|$)/.test(n)) return true
  if (/portrait(\s|$)/.test(n)) return true
  if (/\b9\s*:\s*16\b/.test(n)) return true
  if (/\b1\s*:\s*1\b/.test(n)) return true
  return false
}

type TmdbVideoRow = NonNullable<z.infer<typeof movieVideosSchema>['results']>[number]

function pickTrailerCandidatesFromVideos(
  results: z.infer<typeof movieVideosSchema>['results'] | undefined
): CatalogTrailer[] {
  const rows: TmdbVideoRow[] = results ?? []
  const byKey = new Map<string, TmdbVideoRow>()
  for (const v of rows) {
    if (v.site !== 'YouTube' || !v.key?.trim()) continue
    if (v.type !== 'Trailer') continue
    const key = v.key.trim()
    if (byKey.has(key)) continue
    const name = (v.name ?? '').trim() || 'Trailer'
    if (nameLooksLikeVerticalTrailer(name)) continue
    byKey.set(key, v)
  }
  const unique = [...byKey.values()]
  const official = unique.filter((v) => v.official === true)
  const pool = official.length > 0 ? official : unique
  return pool.map((v) => ({
    name: (v.name ?? '').trim() || 'Trailer',
    youtubeKey: v.key.trim()
  }))
}

async function filterTrailersToLandscape(trailers: CatalogTrailer[]): Promise<CatalogTrailer[]> {
  const max = 12
  const verdicts = await Promise.all(trailers.map((t) => youtubeOEmbedAspectVerdict(t.youtubeKey)))
  const out: CatalogTrailer[] = []
  for (let i = 0; i < trailers.length; i++) {
    const v = verdicts[i]
    if (v === 'portrait') continue
    out.push(trailers[i]!)
    if (out.length >= max) break
  }
  return out
}

export function hasTmdbCredentials(settings: AppSettings): boolean {
  return Boolean(settings.tmdbReadAccessToken.trim() || settings.tmdbApiKey.trim())
}

export async function tmdbFetchJson<T>(
  settings: AppSettings,
  path: string,
  query: Record<string, string> = {},
  opts: { useCache?: boolean; cacheTtlMs?: number } = {}
): Promise<T> {
  if (!hasTmdbCredentials(settings)) {
    throw new Error('NO_CREDENTIALS')
  }

  const cacheKeyStr =
    opts.useCache === false
      ? null
      : cacheKey(['tmdb', path, query, settings.tmdbReadAccessToken, settings.tmdbApiKey])
  if (cacheKeyStr && opts.useCache !== false) {
    const hit = await readCache<T>(cacheKeyStr)
    if (hit !== null) return hit
  }

  await throttle()

  const url = buildUrl(path, query)
  const headers: Record<string, string> = { accept: 'application/json' }
  const token = settings.tmdbReadAccessToken.trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else {
    const key = settings.tmdbApiKey.trim()
    if (!key) throw new Error('NO_CREDENTIALS')
    const u = new URL(url)
    u.searchParams.set('api_key', key)
    const res = await fetch(u, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`TMDB_HTTP_${res.status}:${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as T
    if (cacheKeyStr && opts.cacheTtlMs) {
      await writeCache(cacheKeyStr, json, opts.cacheTtlMs)
    }
    return json
  }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TMDB_HTTP_${res.status}:${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as T
  if (cacheKeyStr && opts.cacheTtlMs) {
    await writeCache(cacheKeyStr, json, opts.cacheTtlMs)
  }
  return json
}

function namesForGenreIds(ids: number[] | undefined, names: Map<number, string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids ?? []) {
    const name = names.get(id)?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

let genreNamesInflight: Promise<void> | null = null

/** Genre names are a separate TMDB list; list rows only carry ids. */
function ensureGenreNames(settings: AppSettings): Promise<void> {
  if (genreNamesInflight) return genreNamesInflight
  genreNamesInflight = (async (): Promise<void> => {
    try {
      await getMovieGenres(settings)
    } catch (error) {
      console.error('Could not load TMDB genre names', error)
    } finally {
      genreNamesInflight = null
    }
  })()
  return genreNamesInflight
}

function mapSearchRowToCatalogItem(
  r: z.infer<typeof searchMovieResultRowSchema>,
  genreNames: Map<number, string>,
  runtime: number | null
): CatalogMovieListItem {
  const rd = r.release_date?.trim() ?? ''
  const releaseDate = rd.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(rd) ? rd.slice(0, 10) : null
  const releaseYear =
    rd.length >= 4 && /^\d{4}/.test(rd) ? parseInt(rd.slice(0, 4), 10) || null : null
  return {
    id: r.id,
    title: r.title,
    releaseDate,
    releaseYear,
    voteAverage: r.vote_average ?? null,
    popularity: r.popularity ?? null,
    posterUrl: posterUrl(r.poster_path ?? null, 'w185'),
    overview: r.overview ?? '',
    genres: namesForGenreIds(r.genre_ids, genreNames),
    runtime
  }
}

function rememberListRows(
  results: z.infer<typeof searchMovieResultRowSchema>[],
  imdbId?: string
): void {
  try {
    const genreNames = new Map<number, string>()
    upsertMovieListRows(
      getLibrary(),
      results.map((r) => {
        const item = mapSearchRowToCatalogItem(r, genreNames, null)
        return {
          tmdbId: item.id,
          title: item.title,
          releaseDate: item.releaseDate ?? (item.releaseYear ? String(item.releaseYear) : null),
          overview: item.overview,
          posterUrl: item.posterUrl,
          voteAverage: item.voteAverage,
          voteCount: r.vote_count ?? null,
          popularity: item.popularity,
          genreIds: r.genre_ids ?? [],
          imdbId: imdbId ?? null
        }
      })
    )
  } catch (error) {
    console.error('Could not save TMDB list rows to the library', error)
  }
}

function mapTmdbResultsToCatalog(
  results: z.infer<typeof searchMovieResultRowSchema>[],
  imdbId?: string
): CatalogMovieListItem[] {
  rememberListRows(results, imdbId)
  const db = getLibrary()
  const genreNames = genreNameById(db)
  const runtimes = runtimesByMovieId(
    db,
    results.map((row) => row.id)
  )
  return results.map((row) =>
    mapSearchRowToCatalogItem(row, genreNames, runtimes.get(row.id) ?? null)
  )
}

const findByExternalIdResponseSchema = z.object({
  movie_results: z.array(searchMovieResultRowSchema).optional()
})

/**
 * Resolve a TMDB movie list row from an IMDb id (`tt…`). Returns null when TMDB has no movie match.
 */
export async function findMovieListItemByImdbId(
  settings: AppSettings,
  imdbId: string
): Promise<CatalogMovieListItem | null> {
  const raw = imdbId.trim().toLowerCase()
  if (!/^tt\d+$/u.test(raw)) {
    return null
  }

  const json = await tmdbFetchJson(
    settings,
    `/find/${encodeURIComponent(raw)}`,
    { external_source: 'imdb_id' },
    { cacheTtlMs: 1000 * 60 * 60 * 24 }
  )
  const parsed = findByExternalIdResponseSchema.safeParse(json)
  if (!parsed.success) {
    return null
  }
  const first = parsed.data.movie_results?.[0]
  if (!first) {
    return null
  }
  await ensureGenreNames(settings)
  return mapTmdbResultsToCatalog([first], raw)[0] ?? null
}

export async function searchMovies(
  settings: AppSettings,
  query: string
): Promise<CatalogMovieListItem[]> {
  const q = query.trim()
  const genresReady = ensureGenreNames(settings)
  const rows: z.infer<typeof searchMovieResultRowSchema>[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= SEARCH_MOVIE_MAX_PAGES) {
    const json = await tmdbFetchJson(
      settings,
      '/search/movie',
      { query: q, include_adult: 'false', page: String(page) },
      { cacheTtlMs: 1000 * 60 * 30 }
    )
    const parsed = searchResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new Error('BAD_RESPONSE')
    }
    const { results, total_pages: tp } = parsed.data
    rows.push(...results)
    totalPages = tp != null && tp >= 1 ? tp : 1
    if (results.length === 0) {
      break
    }
    page += 1
  }

  await genresReady
  return mapTmdbResultsToCatalog(rows)
}

export async function getMovieGenres(
  settings: AppSettings
): Promise<{ id: number; name: string }[]> {
  const json = await tmdbFetchJson(
    settings,
    '/genre/movie/list',
    {},
    { cacheTtlMs: 1000 * 60 * 60 * 24 * 7 }
  )
  const parsed = genreListSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('BAD_RESPONSE')
  }
  try {
    upsertGenres(getLibrary(), parsed.data.genres)
  } catch (error) {
    console.error('Could not save TMDB genres to the library', error)
  }
  return parsed.data.genres
}

/** First discover page for a genre (popular); used for home rails. */
export async function discoverMoviesByGenreFirstPage(
  settings: AppSettings,
  genreId: number
): Promise<CatalogMovieListItem[]> {
  const genresReady = ensureGenreNames(settings)
  const json = await tmdbFetchJson(
    settings,
    '/discover/movie',
    {
      with_genres: String(genreId),
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page: '1'
    },
    { cacheTtlMs: 1000 * 60 * 20 }
  )
  const parsed = searchResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('BAD_RESPONSE')
  }
  await genresReady
  return mapTmdbResultsToCatalog(parsed.data.results)
}

/** Discover for a genre across pages (popularity). */
export async function discoverMoviesByGenre(
  settings: AppSettings,
  genreId: number
): Promise<CatalogMovieListItem[]> {
  const genresReady = ensureGenreNames(settings)
  const rows: z.infer<typeof searchMovieResultRowSchema>[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= DISCOVER_GENRE_MAX_PAGES) {
    const json = await tmdbFetchJson(
      settings,
      '/discover/movie',
      {
        with_genres: String(genreId),
        sort_by: 'popularity.desc',
        include_adult: 'false',
        page: String(page)
      },
      { cacheTtlMs: 1000 * 60 * 20 }
    )
    const parsed = searchResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new Error('BAD_RESPONSE')
    }
    const { results, total_pages: tp } = parsed.data
    rows.push(...results)
    totalPages = tp != null && tp >= 1 ? tp : 1
    if (results.length === 0) {
      break
    }
    page += 1
  }

  await genresReady
  return mapTmdbResultsToCatalog(rows)
}

/** Currently in theaters (TMDB “now playing”). */
export async function getNowPlayingMovies(settings: AppSettings): Promise<CatalogMovieListItem[]> {
  const genresReady = ensureGenreNames(settings)
  const json = await tmdbFetchJson(
    settings,
    '/movie/now_playing',
    { page: '1' },
    { cacheTtlMs: 1000 * 60 * 15 }
  )
  const parsed = searchResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('BAD_RESPONSE')
  }
  await genresReady
  return mapTmdbResultsToCatalog(parsed.data.results)
}

/** TMDB's most popular movies, one page (20 rows). TMDB serves at most 500 pages. */
export async function getPopularMoviesPage(
  settings: AppSettings,
  page: number
): Promise<{ results: CatalogMovieListItem[]; totalPages: number }> {
  const genresReady = ensureGenreNames(settings)
  const json = await tmdbFetchJson(
    settings,
    '/movie/popular',
    { page: String(page) },
    { cacheTtlMs: 1000 * 60 * 60 }
  )
  const parsed = searchResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('BAD_RESPONSE')
  }
  await genresReady
  const totalPages = Math.min(500, parsed.data.total_pages ?? 1)
  return { results: mapTmdbResultsToCatalog(parsed.data.results), totalPages }
}

export async function getMovieDetails(
  settings: AppSettings,
  id: number
): Promise<CatalogMovieDetails> {
  const json = await tmdbFetchJson(
    settings,
    `/movie/${id}`,
    { append_to_response: 'credits,external_ids,videos' },
    { cacheTtlMs: 1000 * 60 * 60 * 24 }
  )
  const parsed = movieDetailSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('BAD_RESPONSE')
  }
  const m = parsed.data
  const cast: CatalogCastMember[] = (m.credits?.cast ?? []).slice(0, 12).map((c) => ({
    name: c.name,
    character: c.character,
    profileUrl: posterUrl(c.profile_path ?? null, 'w185')
  }))

  const trailerCandidates = pickTrailerCandidatesFromVideos(m.videos?.results)
  const trailers = await filterTrailersToLandscape(trailerCandidates)

  const details: CatalogMovieDetails = {
    id: m.id,
    title: m.title,
    tagline: m.tagline ?? '',
    overview: m.overview ?? '',
    runtime: m.runtime ?? null,
    releaseDate: m.release_date ?? null,
    voteAverage: m.vote_average ?? null,
    posterUrl: posterUrl(m.poster_path ?? null, 'w500'),
    backdropUrl: backdropUrl(m.backdrop_path ?? null),
    genres: (m.genres ?? []).map((g) => g.name),
    cast,
    trailers,
    imdbId: m.external_ids?.imdb_id ?? null
  }

  upsertMovie(getLibrary(), {
    tmdbId: m.id,
    title: m.title,
    releaseDate: m.release_date ?? null,
    imdbId: m.external_ids?.imdb_id ?? null,
    overview: details.overview,
    posterUrl: details.posterUrl,
    backdropUrl: details.backdropUrl,
    runtime: details.runtime,
    rating: m.vote_average ?? null,
    voteCount: m.vote_count ?? null,
    popularity: m.popularity ?? null,
    genres: (m.genres ?? []).map((genre) => ({ id: genre.id, name: genre.name })),
    cast: (m.credits?.cast ?? []).slice(0, 12).map((person) => ({
      id: person.id,
      name: person.name,
      character: person.character,
      profileUrl: posterUrl(person.profile_path ?? null, 'w185')
    }))
  })

  return details
}
