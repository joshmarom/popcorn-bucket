import { createHash } from 'crypto'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { z } from 'zod'
import type { AppSettings } from '@shared/app-settings'
import {
  hasMeaningfulListOverview,
  hasListPosterUrl,
  type CatalogCastMember,
  type CatalogMovieDetails,
  type CatalogMovieListItem,
  type CatalogOmdbExtras
} from '@shared/catalog'
import { tmdbFetchJson } from './tmdb'

const externalIdsSchema = z.object({
  imdb_id: z.string().nullable().optional()
})

const omdbResponseSchema = z.object({
  Response: z.string().optional(),
  imdbID: z.string().optional(),
  Poster: z.string().optional(),
  Plot: z.string().optional(),
  Released: z.string().optional(),
  Year: z.string().optional(),
  Runtime: z.string().optional(),
  Genre: z.string().optional(),
  imdbRating: z.string().optional(),
  imdbVotes: z.string().optional(),
  Actors: z.string().optional(),
  Title: z.string().optional(),
  Rated: z.string().optional(),
  Metascore: z.string().optional()
})

type OmdbPlotMode = 'short' | 'full'

type OmdbParsed = {
  posterUrl: string | null
  plot: string | null
  releaseDateIso: string | null
  releaseYear: number | null
  runtimeMinutes: number | null
  genres: string[]
  imdbRating: number | null
  cast: CatalogCastMember[]
  imdbId: string | null
  title: string | null
  rated: string | null
  metascore: string | null
  imdbVotes: string | null
}

function effectiveOmdbApiKey(settings: AppSettings): string {
  return settings.omdbApiKey.trim() || process.env.OMDB_API_KEY?.trim() || ''
}

export function hasOmdbApiKey(settings: AppSettings): boolean {
  return Boolean(effectiveOmdbApiKey(settings))
}

function normalizeImdbId(raw: string): string {
  const s = raw.trim()
  if (s.startsWith('tt')) return s
  if (/^\d+$/.test(s)) return `tt${s}`
  return s
}

let omdbLastFetch = 0
const OMDB_MIN_MS = 120

async function omdbThrottle(): Promise<void> {
  const now = Date.now()
  const wait = omdbLastFetch + OMDB_MIN_MS - now
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  omdbLastFetch = Date.now()
}

type CachedOmdbPayload = OmdbParsed | null

async function readOmdbCache(key: string): Promise<CachedOmdbPayload | undefined> {
  const dir = join(app.getPath('userData'), 'omdb-cache')
  const file = join(dir, `${key}.json`)
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as { exp: number; data: unknown }
    if (parsed.exp < Date.now()) return undefined
    if (parsed.data === null) return null
    if (typeof parsed.data === 'string') return undefined
    return parsed.data as OmdbParsed
  } catch {
    return undefined
  }
}

async function writeOmdbCache(key: string, data: CachedOmdbPayload, ttlMs: number): Promise<void> {
  const dir = join(app.getPath('userData'), 'omdb-cache')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${key}.json`)
  await writeFile(file, JSON.stringify({ exp: Date.now() + ttlMs, data }), 'utf8')
}

function omdbCacheKey(imdb: string, apiKey: string, plot: OmdbPlotMode): string {
  return createHash('sha256')
    .update(JSON.stringify(['v2-omdb-record', imdb, apiKey, plot]))
    .digest('hex')
}

/** Uses TMDB cache when the same movie is requested again. */
export async function fetchImdbIdForTmdbMovie(
  settings: AppSettings,
  tmdbMovieId: number
): Promise<string | null> {
  const json = await tmdbFetchJson(
    settings,
    `/movie/${tmdbMovieId}/external_ids`,
    {},
    { cacheTtlMs: 1000 * 60 * 60 * 24 * 7 }
  )
  const parsed = externalIdsSchema.safeParse(json)
  if (!parsed.success || !parsed.data.imdb_id) {
    return null
  }
  return normalizeImdbId(parsed.data.imdb_id)
}

function parseOmdbRuntime(s: string | undefined): number | null {
  if (!s || s === 'N/A') return null
  const m = /^(\d+)\s*min/i.exec(s.trim())
  return m ? parseInt(m[1], 10) : null
}

function parseOmdbReleased(s: string | undefined): string | null {
  if (!s || s === 'N/A') return null
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

function parseOmdbYearField(s: string | undefined): number | null {
  if (!s || s === 'N/A') return null
  const m = /^(\d{4})/.exec(s.trim())
  return m ? parseInt(m[1], 10) : null
}

function parseOmdbRating(s: string | undefined): number | null {
  if (!s || s === 'N/A') return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function omdbGenreSplit(genre: string | undefined): string[] {
  if (!genre || genre === 'N/A') return []
  return genre
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
}

function actorsToCast(actors: string | undefined): CatalogCastMember[] {
  if (!actors || actors === 'N/A') return []
  return actors
    .split(',')
    .map((name) => ({
      name: name.trim(),
      character: '',
      profileUrl: null as string | null
    }))
    .filter((c) => c.name.length > 0)
}

function posterFromOmdbField(poster: string | undefined): string | null {
  if (!poster || poster === 'N/A' || !/^https?:\/\//i.test(poster)) return null
  return poster
}

function parseOmdbJson(json: unknown, imdbFallback: string): OmdbParsed | null {
  const parsed = omdbResponseSchema.safeParse(json)
  if (!parsed.success || parsed.data.Response === 'False') {
    return null
  }
  const d = parsed.data
  const releasedIso = parseOmdbReleased(d.Released)
  const yearFromField = parseOmdbYearField(d.Year)
  const releaseYear = yearFromField ?? (releasedIso ? parseInt(releasedIso.slice(0, 4), 10) : null)
  const imdbFromApi = d.imdbID ? normalizeImdbId(d.imdbID) : imdbFallback

  return {
    posterUrl: posterFromOmdbField(d.Poster),
    plot: d.Plot && d.Plot !== 'N/A' ? d.Plot : null,
    releaseDateIso: releasedIso,
    releaseYear: releaseYear && Number.isFinite(releaseYear) ? releaseYear : null,
    runtimeMinutes: parseOmdbRuntime(d.Runtime),
    genres: omdbGenreSplit(d.Genre),
    imdbRating: parseOmdbRating(d.imdbRating),
    cast: actorsToCast(d.Actors),
    imdbId: imdbFromApi,
    title: d.Title && d.Title !== 'N/A' ? d.Title : null,
    rated: d.Rated && d.Rated !== 'N/A' ? d.Rated : null,
    metascore: d.Metascore && d.Metascore !== 'N/A' ? d.Metascore : null,
    imdbVotes: d.imdbVotes && d.imdbVotes !== 'N/A' ? d.imdbVotes : null
  }
}

async function fetchOmdbRecord(
  apiKey: string,
  imdbId: string,
  plot: OmdbPlotMode
): Promise<OmdbParsed | null> {
  const imdb = normalizeImdbId(imdbId)
  const cacheKey = omdbCacheKey(imdb, apiKey, plot)
  const cached = await readOmdbCache(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  await omdbThrottle()
  const u = new URL('https://www.omdbapi.com/')
  u.searchParams.set('i', imdb)
  u.searchParams.set('apikey', apiKey)
  u.searchParams.set('plot', plot)

  const res = await fetch(u)
  if (!res.ok) {
    await writeOmdbCache(cacheKey, null, 1000 * 60 * 30)
    return null
  }
  const json: unknown = await res.json()
  const record = parseOmdbJson(json, imdb)
  if (!record) {
    await writeOmdbCache(cacheKey, null, 1000 * 60 * 30)
    return null
  }
  await writeOmdbCache(cacheKey, record, 1000 * 60 * 60 * 24 * 14)
  return record
}

function listItemNeedsOmdb(item: CatalogMovieListItem): boolean {
  return (
    !hasListPosterUrl(item.posterUrl) ||
    !hasMeaningfulListOverview(item.overview) ||
    item.releaseYear == null
  )
}

function buildOmdbExtras(o: OmdbParsed): CatalogOmdbExtras | null {
  const e: CatalogOmdbExtras = {}
  if (o.rated) e.rated = o.rated
  if (o.metascore) e.metascore = o.metascore
  if (o.imdbVotes) e.imdbVotes = o.imdbVotes
  return Object.keys(e).length > 0 ? e : null
}

function mergeListItem(item: CatalogMovieListItem, o: OmdbParsed): CatalogMovieListItem {
  return {
    ...item,
    posterUrl: item.posterUrl ?? o.posterUrl,
    overview: hasMeaningfulListOverview(item.overview)
      ? item.overview
      : o.plot && hasMeaningfulListOverview(o.plot)
        ? o.plot
        : item.overview,
    releaseYear: item.releaseYear ?? o.releaseYear,
    runtime: item.runtime ?? o.runtimeMinutes,
    genres: item.genres.length > 0 ? item.genres : o.genres,
    voteAverage: item.voteAverage ?? o.imdbRating
  }
}

function detailNeedsOmdb(m: CatalogMovieDetails): boolean {
  return (
    !m.posterUrl ||
    m.overview.trim().length === 0 ||
    m.runtime == null ||
    !m.releaseDate ||
    m.voteAverage == null ||
    m.genres.length === 0 ||
    m.cast.length === 0 ||
    !m.imdbId ||
    !m.title.trim()
  )
}

function mergeMovieDetails(movie: CatalogMovieDetails, o: OmdbParsed): CatalogMovieDetails {
  let merged: CatalogMovieDetails = { ...movie }

  if (!merged.posterUrl && o.posterUrl) merged = { ...merged, posterUrl: o.posterUrl }
  if (!merged.overview.trim() && o.plot) merged = { ...merged, overview: o.plot }
  if (merged.runtime == null && o.runtimeMinutes != null)
    merged = { ...merged, runtime: o.runtimeMinutes }
  if (!merged.releaseDate && o.releaseDateIso) merged = { ...merged, releaseDate: o.releaseDateIso }
  if (merged.voteAverage == null && o.imdbRating != null)
    merged = { ...merged, voteAverage: o.imdbRating }
  if (merged.genres.length === 0 && o.genres.length > 0) merged = { ...merged, genres: o.genres }
  if (merged.cast.length === 0 && o.cast.length > 0) merged = { ...merged, cast: o.cast }
  if (!merged.imdbId && o.imdbId) merged = { ...merged, imdbId: o.imdbId }
  if (!merged.title.trim() && o.title) merged = { ...merged, title: o.title }

  const extras = buildOmdbExtras(o)
  if (extras) {
    merged = { ...merged, omdb: extras }
  }

  return merged
}

/** Fill missing list fields (poster, overview, year) from OMDb when an IMDb id exists. */
export async function enrichCatalogListWithOmdb(
  settings: AppSettings,
  items: CatalogMovieListItem[]
): Promise<CatalogMovieListItem[]> {
  const apiKey = effectiveOmdbApiKey(settings)
  if (!apiKey) return items

  const out: CatalogMovieListItem[] = []
  for (const item of items) {
    if (!listItemNeedsOmdb(item)) {
      out.push(item)
      continue
    }
    try {
      const imdb = await fetchImdbIdForTmdbMovie(settings, item.id)
      if (!imdb) {
        out.push(item)
        continue
      }
      const record = await fetchOmdbRecord(apiKey, imdb, 'short')
      out.push(record ? mergeListItem(item, record) : item)
    } catch {
      out.push(item)
    }
  }
  return out
}

/** Detail: one OMDb request with full plot when anything TMDB is missing that OMDb can supply. */
export async function enrichMovieDetailsWithOmdb(
  settings: AppSettings,
  movie: CatalogMovieDetails
): Promise<CatalogMovieDetails> {
  const apiKey = effectiveOmdbApiKey(settings)
  if (!apiKey || !detailNeedsOmdb(movie)) return movie

  let imdb = movie.imdbId ? normalizeImdbId(movie.imdbId) : null
  if (!imdb) {
    try {
      imdb = await fetchImdbIdForTmdbMovie(settings, movie.id)
    } catch {
      return movie
    }
  }
  if (!imdb) return movie

  try {
    const record = await fetchOmdbRecord(apiKey, imdb, 'full')
    return record ? mergeMovieDetails(movie, record) : movie
  } catch {
    return movie
  }
}
