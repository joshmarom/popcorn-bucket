import type { EpisodeTarget } from './tv'

export type AddMovieTorrentPayload = {
  movieId: number
  /** Catalog title, stored so lists never need a TMDB lookup. */
  movieTitle: string
  /** Set for TV episodes (then `movieId` is the episode's media key). */
  episode?: EpisodeTarget
  magnetUri: string
  /** Row title from search results. */
  title: string
  indexerSeeders: number
  indexerLeechers: number
}

export type AddMovieTorrentResponse =
  | { ok: true; downloadId: string }
  | { ok: false; error: string }

/** A download folder on disk that holds a video but is missing from the download list. */
export type UntrackedDownload = {
  movieId: number
  downloadId: string
  dir: string
  videoPath: string
  bytes: number
}

export type MovieTorrentFileProgress = {
  path: string
  length: number
  downloaded: number
  /** 0–1 for this file. */
  progress: number
}

export type MovieTorrentDownloadStatus =
  /** Waiting for a free slot (see the active-download cap in preferences). */
  'queued' | 'pending_metadata' | 'downloading' | 'paused' | 'complete' | 'error'

export type MovieTorrentDownloadSnapshot = {
  downloadId: string
  movieId: number
  /** Null for downloads saved before titles were recorded. */
  movieTitle: string | null
  /** Folder holding this download's files. */
  downloadDir: string
  episode: EpisodeTarget | null
  magnetUri: string
  displayTitle: string
  status: MovieTorrentDownloadStatus
  errorMessage?: string
  /** From swarm once metadata is known; null until then. */
  torrentName: string | null
  indexerSeeders: number
  indexerLeechers: number
  numPeers: number
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  totalBytes: number
  /** Whole-torrent bytes progress 0–1. */
  progress: number
  /** True when the chosen video file has enough bytes to start playback. */
  canPlay: boolean
  files: MovieTorrentFileProgress[]
  playFileLabel: string | null
}
