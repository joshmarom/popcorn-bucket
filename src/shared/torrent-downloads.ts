export type AddMovieTorrentPayload = {
  movieId: number
  magnetUri: string
  /** Row title from search results. */
  title: string
  indexerSeeders: number
  indexerLeechers: number
}

export type AddMovieTorrentResponse =
  | { ok: true; downloadId: string }
  | { ok: false; error: string }

export type MovieTorrentFileProgress = {
  path: string
  length: number
  downloaded: number
  /** 0–1 for this file. */
  progress: number
}

export type MovieTorrentDownloadStatus =
  | 'pending_metadata'
  | 'downloading'
  | 'paused'
  | 'complete'
  | 'error'

export type MovieTorrentDownloadSnapshot = {
  downloadId: string
  movieId: number
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
