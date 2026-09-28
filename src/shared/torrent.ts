import type { CatalogMovieDetails } from './catalog'
import { parseReleaseTitle, parseSizeBytes, type ReleaseInfo } from './release-info'

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

/** One row as returned by a torrent indexer (HTML scrape, API, etc.). */
export type RawTorrentSource = {
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
  /** TorrentClaw scoring and file-scan details, when TorrentClaw knows this torrent. */
  quality?: TorrentQualityInfo
  /** Season/episode reported by the indexer; fills in what the release name does not say. */
  tvEpisode?: { season: number; episode: number | null }
}

export type TorrentAudioTrack = {
  lang: string | null
  codec: string | null
  channels: number | null
}

export type TorrentQualityInfo = {
  /** TorrentClaw's 0-100 score (resolution, source, codec, seeders, size). */
  score: number | null
  /** True when the actual files were scanned, so the fields below reflect the real contents. */
  verified: boolean
  hdr: string | null
  videoCodec: string | null
  videoHeight: number | null
  audioTracks: TorrentAudioTrack[]
  /** ISO 639 codes of embedded subtitle tracks. */
  subtitleLangs: string[]
  /** ISO 639 audio languages (detected from the name when not scanned). */
  languages: string[]
  releaseGroup: string | null
}

/** An indexer row plus what we parsed from its name and size. */
export type TorrentSource = RawTorrentSource & {
  sizeBytes: number | null
  release: ReleaseInfo
}

export function withReleaseInfo(row: RawTorrentSource): TorrentSource {
  const release = parseReleaseTitle(row.title)
  const tv = row.tvEpisode
  if (tv && release.season == null) {
    release.season = tv.season
    release.episode = tv.episode
    release.seasonPack = tv.episode == null
  }
  return { ...row, sizeBytes: parseSizeBytes(row.size), release }
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
