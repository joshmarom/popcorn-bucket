export type TvShowListItem = {
  id: number
  name: string
  firstAirYear: number | null
  posterUrl: string | null
  overview: string
  voteAverage: number | null
  genres: string[]
}

/** Card facts for a show; filled from the library, then TMDB show details when missing. */
export type TvShowListFacts = {
  id: number
  genres: string[]
  seasonCount: number | null
  firstAirYear: number | null
  lastAirYear: number | null
  /** TMDB status, e.g. "Returning Series", "Ended", "Canceled". */
  tmdbStatus: string | null
  lastEpisodeAirDate: string | null
  voteAverage: number | null
}

export type TvShowListFactsResponse =
  | { ok: true; facts: TvShowListFacts[] }
  | { ok: false; error: string }

/** One page of an endless show list (Trending, genre pages). */
export type TvListPageResponse =
  | { ok: true; results: TvShowListItem[]; page: number; hasMore: boolean }
  | { ok: false; error: string }

export type TvGenre = { id: number; name: string }

export type TvGenreRail = { genre: TvGenre; shows: TvShowListItem[] }

export type TvGenreRailsResponse = { ok: true; rails: TvGenreRail[] } | { ok: false; error: string }

export type TvShowListResponse =
  | { ok: true; results: TvShowListItem[] }
  | { ok: false; error: string }

import type { CatalogCastMember, CatalogTrailer } from './catalog'

export type TvSeasonSummary = {
  seasonNumber: number
  name: string
  episodeCount: number
  airYear: number | null
}

export type TvShowDetails = {
  id: number
  name: string
  overview: string
  firstAirYear: number | null
  posterUrl: string | null
  backdropUrl: string | null
  imdbId: string | null
  voteAverage: number | null
  genres: string[]
  cast: CatalogCastMember[]
  trailers: CatalogTrailer[]
  /** Specials (season 0) are left out. */
  seasons: TvSeasonSummary[]
}

export type TvEpisode = {
  /** TMDB episode id. */
  id: number
  seasonNumber: number
  episodeNumber: number
  name: string
  overview: string
  airDate: string | null
  runtime: number | null
  stillUrl: string | null
}

export type TvSeasonDetails = {
  showId: number
  seasonNumber: number
  episodes: TvEpisode[]
}

/** One TMDB page of shows (20 per page). */
export type TvListPage = {
  results: TvShowListItem[]
  page: number
  totalPages: number
  totalResults: number
}

export type TvSearchResponse = ({ ok: true } & TvListPage) | { ok: false; error: string }

export type TvShowResponse = { ok: true; show: TvShowDetails } | { ok: false; error: string }

export type TvSeasonResponse = { ok: true; season: TvSeasonDetails } | { ok: false; error: string }

/**
 * Downloads, watch history, and the watchlist are keyed by one positive number. Movies use their
 * TMDB id; episodes use their TMDB episode id plus this offset so the two never collide.
 */
export const EPISODE_KEY_OFFSET = 1_000_000_000

export function episodeMediaKey(episodeId: number): number {
  return EPISODE_KEY_OFFSET + episodeId
}

export function isEpisodeMediaKey(key: number): boolean {
  return key >= EPISODE_KEY_OFFSET
}

/** What an episode download is for, so the right file is picked from season packs. */
export type EpisodeTarget = {
  showId: number
  showName: string
  seasonNumber: number
  episodeNumber: number
}

export function episodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}
