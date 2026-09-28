export type CatalogMovieListItem = {
  id: number
  title: string
  /** Full `YYYY-MM-DD` from TMDB when present; used for sorting. */
  releaseDate: string | null
  releaseYear: number | null
  voteAverage: number | null
  /** TMDB popularity score; useful for ordering search hits. */
  popularity: number | null
  posterUrl: string | null
  overview: string
  genres: string[]
  /** Runtime in minutes, when known. */
  runtime: number | null
}

/** Rating, genres, and runtime for list cards. Filled from the library, then TMDB when missing. */
export type CatalogMovieListFacts = {
  id: number
  genres: string[]
  runtime: number | null
  voteAverage: number | null
}

export type CatalogMovieListFactsResponse =
  | { ok: true; facts: CatalogMovieListFacts[] }
  | { ok: false; error: string; code: CatalogErrorCode }

/** Strip characters that TMDB/APIs sometimes use as “empty” body text. */
function normalizedListOverview(s: string): string {
  return s
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
}

/** True when overview has visible, non-whitespace content after normalization. */
export function hasMeaningfulListOverview(overview: string): boolean {
  const t = normalizedListOverview(overview)
  return t.length > 0 && /\S/u.test(t)
}

export function hasListPosterUrl(url: string | null): boolean {
  return typeof url === 'string' && url.trim().length > 0
}

/** Keep list rows that have a real poster URL or a readable overview (after TMDB + OMDb). */
export function shouldIncludeCatalogListItem(item: CatalogMovieListItem): boolean {
  return hasListPosterUrl(item.posterUrl) || hasMeaningfulListOverview(item.overview)
}

export type CatalogCastMember = {
  name: string
  character: string
  profileUrl: string | null
}

/** YouTube trailer/teaser from TMDB `videos` (site YouTube, `key` is the embed id). */
export type CatalogTrailer = {
  name: string
  youtubeKey: string
}

/** Optional fields from OMDb when the detail view used it for enrichment. */
export type CatalogOmdbExtras = {
  rated?: string | null
  metascore?: string | null
  imdbVotes?: string | null
}

export type CatalogMovieDetails = {
  id: number
  title: string
  tagline: string
  overview: string
  runtime: number | null
  releaseDate: string | null
  voteAverage: number | null
  posterUrl: string | null
  backdropUrl: string | null
  genres: string[]
  cast: CatalogCastMember[]
  trailers: CatalogTrailer[]
  imdbId: string | null
  omdb?: CatalogOmdbExtras | null
}

export type CatalogErrorCode =
  | 'NO_CREDENTIALS'
  | 'NETWORK'
  | 'BAD_RESPONSE'
  | 'NOT_FOUND'
  | 'VALIDATION'

export type CatalogSearchResponse =
  | { ok: true; results: CatalogMovieListItem[] }
  | { ok: false; error: string; code: CatalogErrorCode }

/** One page of the endless Trending list; there is no total, only whether a next page exists. */
export type CatalogTrendingPageResponse =
  | { ok: true; results: CatalogMovieListItem[]; page: number; hasMore: boolean }
  | { ok: false; error: string; code: CatalogErrorCode }

export type MovieGenre = {
  id: number
  name: string
}

export type CatalogGenreRail = {
  genre: MovieGenre
  movies: CatalogMovieListItem[]
}

export type CatalogGenreRailsResponse =
  | { ok: true; rails: CatalogGenreRail[] }
  | { ok: false; error: string; code: CatalogErrorCode }

export type CatalogMovieResponse =
  | { ok: true; movie: CatalogMovieDetails }
  | { ok: false; error: string; code: CatalogErrorCode }
