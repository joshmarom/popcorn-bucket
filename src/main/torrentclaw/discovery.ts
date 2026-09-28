import { app } from 'electron'
import type { z } from 'zod'
import type {
  AutocompleteSuggestion,
  DiscoverCollection,
  DiscoverMovieItem,
  DiscoverShowItem,
  StreamingService
} from '@shared/discovery'
import type { LibraryDb } from '../library/db'
import { upsertMovieListRows } from '../library/movies'
import type { TrendingSwarmRow } from '../library/ranked-lists'
import { upsertShowListRows } from '../library/shows'
import { tcFetchJson } from './client'
import {
  tcAutocompleteSchema,
  tcCollectionDetailSchema,
  tcCollectionListSchema,
  tcListResponseSchema,
  tcSearchResponseSchema,
  tcStreamingTopSchema,
  type TcListItem
} from './schemas'

const LIST_TTL_MS = 30 * 60 * 1000
const STREAMING_TOP_TTL_MS = 6 * 60 * 60 * 1000
const AUTOCOMPLETE_TTL_MS = 10 * 60 * 1000
const PAGE_LIMIT = 50

function numericId(raw: number | string | null | undefined): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

function parseRating(raw: string | number | null | undefined): number | null {
  const n = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function toMovieItem(
  item: Omit<TcListItem, 'id'>,
  rank: number | null = null
): DiscoverMovieItem | null {
  const tmdbId = numericId(item.tmdbId)
  if (tmdbId == null) return null
  return {
    id: tmdbId,
    title: item.title,
    releaseDate: item.releaseDate ?? null,
    releaseYear:
      item.year ?? (item.releaseDate ? Number(item.releaseDate.slice(0, 4)) || null : null),
    voteAverage: parseRating(item.rating),
    popularity: null,
    posterUrl: item.posterUrl ?? null,
    overview: item.overview ?? '',
    genres: item.genres ?? [],
    runtime: null,
    rank,
    maxSeeders: item.maxSeeders ?? null
  }
}

function toShowItem(
  item: Omit<TcListItem, 'id'>,
  rank: number | null = null
): DiscoverShowItem | null {
  const tmdbId = numericId(item.tmdbId)
  if (tmdbId == null) return null
  return {
    id: tmdbId,
    name: item.title,
    firstAirYear: item.year ?? null,
    posterUrl: item.posterUrl ?? null,
    overview: item.overview ?? '',
    voteAverage: parseRating(item.rating),
    genres: item.genres ?? [],
    rank,
    maxSeeders: item.maxSeeders ?? null
  }
}

function uniqueById<T extends { id: number }>(items: (T | null)[]): T[] {
  const seen = new Set<number>()
  const out: T[] = []
  for (const item of items) {
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function uniqueMovies(items: (DiscoverMovieItem | null)[]): DiscoverMovieItem[] {
  const seen = new Set<number>()
  const out: DiscoverMovieItem[] = []
  for (const item of items) {
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

async function fetchListPages(
  path: string,
  params: Record<string, string | number | undefined>,
  pages: number
): Promise<TcListItem[]> {
  const out: TcListItem[] = []
  for (let page = 1; page <= pages; page++) {
    const res = await tcFetchJson(
      path,
      { ...params, page, limit: PAGE_LIMIT },
      { schema: tcListResponseSchema, ttlMs: LIST_TTL_MS }
    )
    out.push(...res.items)
    // The server may cap `limit` (popular pages hold 24), so compare against what it used.
    if (res.items.length < (res.pageSize ?? PAGE_LIMIT)) break
  }
  return out
}

/** Titles ranked by corroborated swarm size (only titles with a poster and seeders). */
export async function fetchPopular(type: 'movie' | 'show', pages = 1): Promise<TcListItem[]> {
  return fetchListPages('/popular', { type }, pages)
}

export async function getPopularMovies(): Promise<DiscoverMovieItem[]> {
  return uniqueMovies((await fetchPopular('movie')).map((i) => toMovieItem(i)))
}

export async function getPopularShows(): Promise<DiscoverShowItem[]> {
  return uniqueById(
    (await fetchPopular('show')).filter((i) => i.contentType === 'show').map((i) => toShowItem(i))
  )
}

export async function getUpcomingMovies(): Promise<DiscoverMovieItem[]> {
  const items = await fetchListPages('/upcoming', { type: 'movie' }, 1)
  return uniqueMovies(items.map((i) => toMovieItem(i)))
}

function localeCountry(): string {
  const code = app.getLocaleCountryCode()?.toUpperCase() ?? ''
  return /^[A-Z]{2}$/.test(code) ? code : 'US'
}

async function streamingTopRows(
  service: StreamingService,
  showType: 'movie' | 'series'
): Promise<z.infer<typeof tcStreamingTopSchema>> {
  const load = async (country: string): Promise<z.infer<typeof tcStreamingTopSchema>> => {
    const rows = await tcFetchJson(
      '/streaming-top',
      { service, country, show_type: showType },
      { schema: tcStreamingTopSchema, ttlMs: STREAMING_TOP_TTL_MS }
    )
    return rows
      .filter((r) => r.hasTorrents !== false && r.tmdbId != null)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ ...r, posterUrl: r.localPosterUrl ?? r.posterUrl ?? null }))
  }
  const country = localeCountry()
  const rows = await load(country)
  return rows.length > 0 || country === 'US' ? rows : load('US')
}

export async function getStreamingTop(service: StreamingService): Promise<DiscoverMovieItem[]> {
  const rows = await streamingTopRows(service, 'movie')
  return uniqueMovies(rows.map((r) => toMovieItem(r, r.rank)))
}

export async function getStreamingTopShows(service: StreamingService): Promise<DiscoverShowItem[]> {
  const rows = await streamingTopRows(service, 'series')
  return uniqueById(rows.map((r) => toShowItem(r, r.rank)))
}

function toCollection(c: {
  id: number
  name: string
  posterUrl?: string | null
  backdropUrl?: string | null
  movieCount: number
  overview?: string | null
}): DiscoverCollection {
  return {
    id: c.id,
    name: c.name,
    posterUrl: c.posterUrl ?? null,
    backdropUrl: c.backdropUrl ?? null,
    movieCount: c.movieCount,
    overview: c.overview ?? null
  }
}

export async function getCollections(): Promise<DiscoverCollection[]> {
  const res = await tcFetchJson(
    '/collections',
    { limit: 24 },
    { schema: tcCollectionListSchema, ttlMs: LIST_TTL_MS }
  )
  return res.items.filter((c) => c.movieCount > 1).map(toCollection)
}

export async function getCollection(
  id: number
): Promise<{ collection: DiscoverCollection; movies: DiscoverMovieItem[] }> {
  const res = await tcFetchJson(
    `/collections/${id}`,
    {},
    {
      schema: tcCollectionDetailSchema,
      ttlMs: LIST_TTL_MS
    }
  )
  return {
    collection: toCollection(res),
    movies: uniqueMovies(res.movies.map((m) => toMovieItem(m)))
  }
}

export async function autocomplete(q: string): Promise<AutocompleteSuggestion[]> {
  const res = await tcFetchJson(
    '/autocomplete',
    { q },
    { schema: tcAutocompleteSchema, ttlMs: AUTOCOMPLETE_TTL_MS, timeoutMs: 5000 }
  )
  return res.suggestions.map((s) => ({
    id: s.id,
    title: s.title,
    year: s.year ?? null,
    contentType: s.contentType,
    posterUrl: s.posterUrl ?? null,
    movieCount: s.movieCount ?? null
  }))
}

/** Autocomplete only returns TorrentClaw ids; look the title up again to get its TMDB id. */
export async function resolveSuggestionTmdbId(s: {
  id: number
  title: string
  year: number | null
  contentType: 'movie' | 'show'
}): Promise<number | null> {
  const res = await tcFetchJson(
    '/search',
    {
      q: s.title,
      type: s.contentType,
      year_min: s.year ?? undefined,
      year_max: s.year ?? undefined,
      limit: 10
    },
    { schema: tcSearchResponseSchema, ttlMs: LIST_TTL_MS }
  )
  const exact = res.results.find((r) => r.id === s.id)
  const byTitle = res.results.find(
    (r) => r.title.toLowerCase() === s.title.toLowerCase() && (s.year == null || r.year === s.year)
  )
  return numericId((exact ?? byTitle)?.tmdbId)
}

function existingIds(db: LibraryDb, table: 'movies' | 'shows', ids: number[]): Set<number> {
  if (ids.length === 0) return new Set()
  const rows = db
    .prepare(`SELECT tmdb_id FROM ${table} WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as { tmdb_id: number }[]
  return new Set(rows.map((r) => r.tmdb_id))
}

/**
 * Swarm rows for the Trending rails, built from TorrentClaw's popular list. Titles the library has
 * not seen are saved first (swarm rows need a movie/show row); the year stands in for a release
 * date until TMDB details replace it.
 */
export async function fetchPopularSwarm(
  db: LibraryDb,
  type: 'movie' | 'show',
  now = Date.now()
): Promise<TrendingSwarmRow[]> {
  const items = withTmdbIds(await fetchPopular(type, 4), type)
  saveNewListRows(db, type, items, now)
  // A big swarm on TorrentClaw's popular list means current activity (e.g. a new season airing).
  const nowUnix = Math.floor(now / 1000)
  return items.map(({ item, tmdbId }) => ({
    tmdbId,
    seeders: item.maxSeeders ?? 0,
    peers: 0,
    latestUploadUnix: nowUnix
  }))
}

/**
 * One page of TorrentClaw's popular movies for the endless Trending list. New titles are saved
 * to the library so later rebuilds can rank them.
 */
export async function getPopularMoviesPage(
  db: LibraryDb,
  page: number
): Promise<{ items: DiscoverMovieItem[]; done: boolean }> {
  const res = await tcFetchJson(
    '/popular',
    { type: 'movie', page, limit: PAGE_LIMIT },
    { schema: tcListResponseSchema, ttlMs: LIST_TTL_MS }
  )
  saveNewListRows(db, 'movie', withTmdbIds(res.items, 'movie'), Date.now())
  return {
    items: uniqueMovies(res.items.map((i) => toMovieItem(i))),
    done: res.items.length === 0
  }
}

/** One page of TorrentClaw's popular shows for the endless TV Trending list. */
export async function getPopularShowsPage(
  db: LibraryDb,
  page: number
): Promise<{ items: DiscoverShowItem[]; done: boolean }> {
  const res = await tcFetchJson(
    '/popular',
    { type: 'show', page, limit: PAGE_LIMIT },
    { schema: tcListResponseSchema, ttlMs: LIST_TTL_MS }
  )
  saveNewListRows(db, 'show', withTmdbIds(res.items, 'show'), Date.now())
  return {
    items: uniqueById(res.items.filter((i) => i.contentType === 'show').map((i) => toShowItem(i))),
    done: res.items.length === 0
  }
}

function withTmdbIds(
  items: TcListItem[],
  type: 'movie' | 'show'
): { item: TcListItem; tmdbId: number }[] {
  return items.flatMap((item) => {
    const tmdbId = numericId(item.tmdbId)
    return tmdbId != null && item.contentType === type ? [{ item, tmdbId }] : []
  })
}

/** Titles the library has not seen are saved; the year stands in until TMDB details replace it. */
function saveNewListRows(
  db: LibraryDb,
  type: 'movie' | 'show',
  items: { item: TcListItem; tmdbId: number }[],
  now: number
): void {
  const known = existingIds(
    db,
    type === 'movie' ? 'movies' : 'shows',
    items.map((i) => i.tmdbId)
  )
  const fresh = items.filter((i) => !known.has(i.tmdbId))
  if (type === 'movie') {
    upsertMovieListRows(
      db,
      fresh.map(({ item, tmdbId }) => ({
        tmdbId,
        title: item.title,
        releaseDate: item.year ? String(item.year) : null,
        overview: item.overview ?? '',
        posterUrl: item.posterUrl ?? null,
        voteAverage: parseRating(item.rating),
        voteCount: null,
        popularity: null,
        genreIds: []
      })),
      now
    )
  } else {
    upsertShowListRows(
      db,
      fresh.map(({ item, tmdbId }) => ({
        tmdbId,
        name: item.title,
        firstAirDate: item.year ? String(item.year) : null,
        overview: item.overview ?? '',
        posterUrl: item.posterUrl ?? null,
        voteAverage: parseRating(item.rating),
        voteCount: null,
        popularity: null
      })),
      now
    )
  }
}
