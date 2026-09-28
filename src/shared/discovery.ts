import type { CatalogMovieListItem } from './catalog'
import type { TvShowListItem } from './tv'

/** A TorrentClaw list row mapped onto our TMDB-keyed movie card. */
export type DiscoverMovieItem = CatalogMovieListItem & {
  /** Position in a streaming Top 10. */
  rank: number | null
  /** Best swarm TorrentClaw has seen for this title. */
  maxSeeders: number | null
}

export type DiscoverListResponse =
  | { ok: true; items: DiscoverMovieItem[] }
  | { ok: false; error: string }

/** A TorrentClaw show row mapped onto our TMDB-keyed show card. */
export type DiscoverShowItem = TvShowListItem & {
  rank: number | null
  maxSeeders: number | null
}

export type DiscoverShowListResponse =
  | { ok: true; items: DiscoverShowItem[] }
  | { ok: false; error: string }

export const STREAMING_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'prime', label: 'Prime Video' },
  { id: 'disney', label: 'Disney+' },
  { id: 'apple', label: 'Apple TV+' }
] as const

export type StreamingService = (typeof STREAMING_SERVICES)[number]['id']

export type DiscoverCollection = {
  /** TorrentClaw collection id (used in `/collection/:id`). */
  id: number
  name: string
  posterUrl: string | null
  backdropUrl: string | null
  movieCount: number
  overview: string | null
}

export type DiscoverCollectionsResponse =
  | { ok: true; collections: DiscoverCollection[] }
  | { ok: false; error: string }

export type DiscoverCollectionResponse =
  | { ok: true; collection: DiscoverCollection; movies: DiscoverMovieItem[] }
  | { ok: false; error: string }

export type AutocompleteSuggestion = {
  /** TorrentClaw content or collection id. */
  id: number
  title: string
  year: number | null
  contentType: 'movie' | 'show' | 'collection'
  posterUrl: string | null
  movieCount: number | null
}

export type AutocompleteResponse =
  | { ok: true; suggestions: AutocompleteSuggestion[] }
  | { ok: false; error: string }

/** Where the app should navigate for a picked suggestion. */
export type ResolveSuggestionResponse = { ok: true; route: string } | { ok: false; error: string }
