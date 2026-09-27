import * as ElectronStoreModule from 'electron-store'

type StoreCtor = typeof import('electron-store').default

function getStoreConstructor(): StoreCtor {
  const exported = (ElectronStoreModule as { default?: unknown }).default
  if (typeof exported === 'function') {
    return exported as StoreCtor
  }
  if (
    exported !== null &&
    typeof exported === 'object' &&
    'default' in exported &&
    typeof (exported as { default: unknown }).default === 'function'
  ) {
    return (exported as { default: StoreCtor }).default
  }
  throw new Error('Could not load electron-store constructor.')
}

/** Last-known stats when a download finished (for UI after restart or torrent teardown). */
export type PersistedDownloadCompleteSummary = {
  totalBytes: number
  downloaded: number
  progress: number
  torrentName: string | null
  playFileLabel: string | null
}

export type PersistedMovieDownload = {
  id: string
  movieId: number
  magnetUri: string
  displayTitle: string
  movieTitle: string | null
  indexerSeeders: number
  indexerLeechers: number
  createdAt: number
  /** Relative path of the chosen video within the torrent, once metadata is known. */
  playFilePath: string | null
  /** Absolute path of the finished video on disk; null until the download completes. */
  playFileAbsPath: string | null
  /** Folder holding this download's files; null for rows saved before it was recorded. */
  downloadDir: string | null
  paused: boolean
  /** True when the download had fully finished (kept in the list until the user deletes it). */
  completed: boolean
  /** Present when `completed` was true at least once; used for list/progress after restart. */
  completeSummary?: PersistedDownloadCompleteSummary
}

type StoreShape = {
  list: PersistedMovieDownload[]
}

const downloadStore = new (getStoreConstructor())({
  name: 'popcorn-bucket-movie-downloads',
  defaults: { list: [] } satisfies StoreShape
})

export function loadPersistedMovieDownloads(): PersistedMovieDownload[] {
  const raw = downloadStore.get('list') as unknown
  if (!Array.isArray(raw)) return []
  const out: PersistedMovieDownload[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    const movieId = typeof r.movieId === 'number' ? r.movieId : Number.NaN
    const magnetUri = typeof r.magnetUri === 'string' ? r.magnetUri : ''
    const completed = Boolean(r.completed)
    // Finished downloads recovered from disk have no magnet; everything else needs one.
    if (!id || !Number.isFinite(movieId) || movieId < 1 || (!completed && !magnetUri.trim())) {
      continue
    }
    let completeSummary: PersistedDownloadCompleteSummary | undefined
    const sum = r.completeSummary
    if (sum && typeof sum === 'object') {
      const o = sum as Record<string, unknown>
      const totalBytes = typeof o.totalBytes === 'number' ? o.totalBytes : 0
      const downloaded = typeof o.downloaded === 'number' ? o.downloaded : 0
      const progress = typeof o.progress === 'number' ? o.progress : 0
      completeSummary = {
        totalBytes: Math.max(0, totalBytes),
        downloaded: Math.max(0, downloaded),
        progress: Math.min(1, Math.max(0, progress)),
        torrentName: typeof o.torrentName === 'string' ? o.torrentName : null,
        playFileLabel: typeof o.playFileLabel === 'string' ? o.playFileLabel : null
      }
    }
    out.push({
      id,
      movieId,
      magnetUri: magnetUri.trim(),
      displayTitle: typeof r.displayTitle === 'string' ? r.displayTitle : 'Torrent',
      movieTitle: typeof r.movieTitle === 'string' ? r.movieTitle : null,
      indexerSeeders:
        typeof r.indexerSeeders === 'number' && r.indexerSeeders >= 0
          ? Math.floor(r.indexerSeeders)
          : 0,
      indexerLeechers:
        typeof r.indexerLeechers === 'number' && r.indexerLeechers >= 0
          ? Math.floor(r.indexerLeechers)
          : 0,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      playFilePath: typeof r.playFilePath === 'string' ? r.playFilePath : null,
      playFileAbsPath: typeof r.playFileAbsPath === 'string' ? r.playFileAbsPath : null,
      downloadDir: typeof r.downloadDir === 'string' ? r.downloadDir : null,
      paused: Boolean(r.paused),
      completed,
      completeSummary
    })
  }
  return out
}

export function savePersistedMovieDownloads(rows: PersistedMovieDownload[]): void {
  downloadStore.set('list', rows)
}
