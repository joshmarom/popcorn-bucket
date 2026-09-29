import { app } from 'electron'
import type { z } from 'zod'
import type {
  AutocompleteSuggestion,
  DiscoverCollection,
  DiscoverMovieItem,
  DiscoverShowItem,
  StreamingService
} from '@shared/discovery'
import type { TvSeasonDetails } from '@shared/tv'
import { getLibrary, type LibraryDb } from '../library/db'
import { enqueueMediaFromUrls } from '../library/media-assets'
import { upsertMovieListRows } from '../library/movies'
import { saveTvSeason, readStoredTvSeason } from '../library/tv-episodes'
import type { TrendingSwarmRow } from '../library/ranked-lists'
import { saveShowSeasonSummaries, upsertShowListRows } from '../library/shows'
import { tcFetchJson } from './client'
import {
  tcAutocompleteSchema,
  tcCollectionDetailSchema,
  tcCollectionListSchema,
  tcListResponseSchema,
  tcSearchResponseSchema,
  tcStreamingTopSchema,
  type TcListItem,
  type TcSearchResult
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

function listRating(item: Omit<TcListItem, 'id'> & { ratingTmdb?: string | number | null }): number | null {
  return parseRating(item.ratingTmdb) ?? parseRating(item.rating)
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
    voteAverage: listRating(item),
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
    voteAverage: listRating(item),
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
  type: 'movie' | 'show',
  assumeType = false
): { item: TcListItem; tmdbId: number }[] {
  return items.flatMap((item) => {
    const tmdbId = numericId(item.tmdbId)
    if (tmdbId == null) return []
    if (item.contentType === type || (assumeType && item.contentType == null)) {
      return [{ item, tmdbId }]
    }
    return []
  })
}

function searchHitsToList(
  results: TcSearchResult[],
  type: 'movie' | 'show'
): { item: TcListItem; tmdbId: number }[] {
  return withTmdbIds(
    results.map((hit) => ({
      id: hit.id,
      tmdbId: hit.tmdbId,
      imdbId: hit.imdbId,
      title: hit.title,
      contentType: hit.contentType,
      year: hit.year,
      posterUrl: hit.posterUrl,
      backdropUrl: hit.backdropUrl,
      overview: hit.overview,
      genres: hit.genres,
      originCountry: hit.originCountry,
      titleOriginal: hit.titleOriginal,
      rating: hit.ratingTmdb ?? hit.rating,
      maxSeeders: hit.maxSeeders ?? null,
      releaseDate: null,
      hasTorrents: hit.hasTorrents
    })),
    type
  )
}

function torrentClawEpisodeId(showId: number, season: number, episode: number): number {
  return -(showId * 1_000_000 + season * 1_000 + episode)
}

function persistTvFromTorrentClaw(db: LibraryDb, tmdbId: number, hit: TcSearchResult): void {
  const seasons = (hit.seasons ?? []).filter((season) => season.season > 0)
  if (seasons.length === 0) return
  saveShowSeasonSummaries(
    db,
    tmdbId,
    seasons.map((season) => ({
      seasonNumber: season.season,
      name: `Season ${season.season}`,
      episodeCount: season.episodeCount ?? season.episodes?.length ?? 0,
      airYear: null
    }))
  )
  enqueueMediaFromUrls(db, {
    tmdbId,
    stillUrls: seasons.flatMap((season) => [
      ...(season.posterUrl ? [season.posterUrl] : []),
      ...(season.episodes ?? []).flatMap((episode) => (episode.stillUrl ? [episode.stillUrl] : []))
    ])
  })
  for (const season of seasons) {
    if (!season.episodes?.length) continue
    saveTvSeason(db, {
      showId: tmdbId,
      seasonNumber: season.season,
      episodes: season.episodes.map((episode) => ({
        id: torrentClawEpisodeId(tmdbId, season.season, episode.episode),
        seasonNumber: season.season,
        episodeNumber: episode.episode,
        name: episode.name,
        overview: episode.overview ?? '',
        airDate: episode.airDate ?? null,
        runtime: episode.runtime ?? null,
        stillUrl: episode.stillUrl ?? null
      }))
    })
  }
}

/** Titles the library has not seen are saved; the year stands in until TMDB details replace it. */
function saveNewListRows(
  db: LibraryDb,
  type: 'movie' | 'show',
  items: { item: TcListItem; tmdbId: number }[],
  now: number
): void {
  if (type === 'movie') {
    upsertMovieListRows(
      db,
      items.map(({ item, tmdbId }) => ({
        tmdbId,
        title: item.title,
        releaseDate: item.year ? String(item.year) : item.releaseDate ?? null,
        overview: item.overview ?? '',
        posterUrl: item.posterUrl ?? null,
        backdropUrl: item.backdropUrl ?? null,
        voteAverage: listRating(item),
        voteCount: null,
        popularity: null,
        genreIds: [],
        imdbId: item.imdbId ?? null,
        originCountry: item.originCountry ?? undefined,
        titleOriginal: item.titleOriginal ?? null
      })),
      now
    )
  } else {
    upsertShowListRows(
      db,
      items.map(({ item, tmdbId }) => ({
        tmdbId,
        name: item.title,
        firstAirDate: item.year ? String(item.year) : null,
        overview: item.overview ?? '',
        posterUrl: item.posterUrl ?? null,
        backdropUrl: item.backdropUrl ?? null,
        voteAverage: listRating(item),
        voteCount: null,
        popularity: null,
        imdbId: item.imdbId ?? null,
        genres: item.genres ?? undefined,
        originCountry: item.originCountry ?? undefined,
        titleOriginal: item.titleOriginal ?? null
      })),
      now
    )
  }
}

export async function fetchContentByTmdbId(
  tmdbId: number,
  type: 'movie' | 'show',
  extra?: { includeSeasons?: boolean }
): Promise<TcSearchResult | null> {
  const res = await tcFetchJson(
    '/search',
    {
      tmdbid: tmdbId,
      type,
      limit: 1,
      include: extra?.includeSeasons ? 'seasons,episodes' : undefined
    },
    { schema: tcSearchResponseSchema, ttlMs: LIST_TTL_MS }
  )
  const hit = res.results.find((r) => numericId(r.tmdbId) === tmdbId) ?? res.results[0]
  return hit ?? null
}

/** Persist TorrentClaw metadata for a TMDB id when TMDB itself is down. */
export async function hydrateFromTorrentClaw(
  db: LibraryDb,
  tmdbId: number,
  type: 'movie' | 'show'
): Promise<boolean> {
  const hit = await fetchContentByTmdbId(tmdbId, type, {
    includeSeasons: type === 'show'
  }).catch(() => null)
  if (!hit || numericId(hit.tmdbId) !== tmdbId) return false
  saveNewListRows(db, type, searchHitsToList([hit], type), Date.now())
  if (type === 'show') persistTvFromTorrentClaw(db, tmdbId, hit)
  return true
}

export async function hydrateSeasonFromTorrentClaw(
  db: LibraryDb,
  showId: number,
  seasonNumber: number
): Promise<TvSeasonDetails | null> {
  const hit = await fetchContentByTmdbId(showId, 'show', { includeSeasons: true }).catch(() => null)
  if (!hit || numericId(hit.tmdbId) !== showId) return null
  persistTvFromTorrentClaw(db, showId, hit)
  return readStoredTvSeason(db, showId, seasonNumber)
}

export async function fetchTrending(
  type: 'movie' | 'show',
  period: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<TcListItem[]> {
  const res = await tcFetchJson(
    '/trending',
    { period, type, limit: PAGE_LIMIT, page: 1 },
    { schema: tcListResponseSchema, ttlMs: LIST_TTL_MS }
  )
  return res.items.filter((item) => item.contentType === type || item.contentType == null)
}

export async function ingestTrendingLists(db: LibraryDb): Promise<void> {
  for (const type of ['movie', 'show'] as const) {
    const popular = withTmdbIds(await fetchPopular(type, 2).catch(() => []), type)
    saveNewListRows(db, type, popular, Date.now())
    for (const period of ['daily', 'weekly', 'monthly'] as const) {
      const trending = withTmdbIds(await fetchTrending(type, period).catch(() => []), type, true)
      saveNewListRows(db, type, trending, Date.now())
    }
    const recent = withTmdbIds(
      await fetchListPages('/recent', { type }, 1).catch(() => []),
      type,
      true
    )
    saveNewListRows(db, type, recent, Date.now())
  }
}

export async function searchMoviesFromTorrentClaw(query: string): Promise<DiscoverMovieItem[]> {
  const res = await tcFetchJson(
    '/search',
    { q: query, type: 'movie', limit: 20 },
    { schema: tcSearchResponseSchema, ttlMs: AUTOCOMPLETE_TTL_MS }
  )
  saveNewListRows(getLibrary(), 'movie', searchHitsToList(res.results, 'movie'), Date.now())
  return uniqueMovies(res.results.map((item) => toMovieItem(item)))
}

export async function searchShowsFromTorrentClaw(query: string): Promise<DiscoverShowItem[]> {
  const res = await tcFetchJson(
    '/search',
    { q: query, type: 'show', limit: 20 },
    { schema: tcSearchResponseSchema, ttlMs: AUTOCOMPLETE_TTL_MS }
  )
  saveNewListRows(getLibrary(), 'show', searchHitsToList(res.results, 'show'), Date.now())
  return uniqueById(res.results.map((item) => toShowItem(item)))
}
