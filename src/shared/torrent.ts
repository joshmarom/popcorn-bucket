import type { CatalogMovieDetails } from './catalog'

export type TorrentSearchErrorCode =
  | 'NO_CREDENTIALS'
  | 'NO_PROVIDERS'
  | 'VALIDATION'
  | 'NETWORK'
  | 'BAD_RESPONSE'

export type TorrentProviderError = {
  provider: string
  message: string
}

/** One row from a torrent indexer (HTML scrape, API, etc.). */
export type TorrentSource = {
  title: string
  providerName: string
  size: string | null
  seeders: number
  leechers: number
  magnetUri: string | null
  /** Direct `.torrent` download URL when the indexer exposes it. */
  torrentFileUrl: string | null
  /** HTTPS details/comments page when available. */
  detailsUrl: string | null
  uploadDate: string | null
}

export type TorrentSearchResponse =
  | {
      ok: true
      results: TorrentSource[]
      errors: TorrentProviderError[]
      /** True when this payload was loaded from the 5-day on-disk cache. */
      cached?: boolean
      /** Epoch ms when the cached snapshot was written (only when `cached` is true). */
      cachedAtMs?: number
    }
  | { ok: false; error: string; code: TorrentSearchErrorCode }

export type TorrentSearchInput = {
  title: string
  releaseDate: string | null
  imdbId: string | null
  /** When true, skip cache and re-query all providers. */
  forceRefresh?: boolean
}

export function buildTorrentSearchQuery(movie: CatalogMovieDetails): TorrentSearchInput {
  return {
    title: movie.title,
    releaseDate: movie.releaseDate,
    imdbId: movie.imdbId
  }
}

/** Basic magnet sanity check before copy / display. */
export function isValidMagnetUri(uri: string): boolean {
  const s = uri.trim()
  return /^magnet:\?/i.test(s) && /xt=urn:btih:/i.test(s)
}

/** Only allow opening https links from indexer metadata. */
export function isSafeTorrentDetailsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:'
  } catch {
    return false
  }
}
