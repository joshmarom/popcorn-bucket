import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppSettings } from '@shared/app-settings'
import type {
  CatalogGenreRailsResponse,
  CatalogMovieResponse,
  CatalogSearchResponse
} from '@shared/catalog'
import type { TorrentSearchInput, TorrentSearchResponse } from '@shared/torrent'
import type {
  AddMovieTorrentPayload,
  AddMovieTorrentResponse,
  MovieTorrentDownloadSnapshot,
  UntrackedDownload
} from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse } from '@shared/torrent-stream'
import type { WatchProgress } from '@shared/watch-history'
import type { Preferences } from '@shared/preferences'
import type { ProviderHealth } from '@shared/provider-health'

export type PopcornApi = {
  app: {
    openExternal(url: string): Promise<void>
    /** Open (or focus) VidKing in a dedicated top-level Electron window. */
    openVidkingEmbed(url: string): Promise<void>
    /** Clear cookies, storage, and HTTP cache of the isolated VidKing session. */
    clearVidkingData(): Promise<void>
    /** Reveal a download's video (or folder) in Finder / Explorer. */
    showDownloadInFolder(downloadId: string): Promise<void>
    /**
     * Recent VidKing/Videasy request outcomes captured by main process hooks.
     * Useful for diagnosing "no servers found" cases.
     */
    getVidkingDiagnostics(): Promise<
      {
        at: string
        phase: 'completed' | 'error'
        url: string
        method?: string
        resourceType?: string
        statusCode?: number
        error?: string
      }[]
    >
  }
  settings: {
    get(): Promise<AppSettings>
    /** False when the OS offers no secure storage and keys are saved as plain text. */
    isEncrypted(): Promise<boolean>
    set(partial: Partial<AppSettings>): Promise<void>
  }
  prefs: {
    get(): Promise<Preferences>
    set(
      partial: Partial<Preferences>
    ): Promise<{ ok: true; prefs: Preferences } | { ok: false; error: string }>
    /** Native folder picker; null when cancelled. */
    chooseDownloadDir(): Promise<string | null>
    defaultDownloadDir(): Promise<string>
  }
  catalog: {
    nowPlaying(opts?: { forceRefresh?: boolean }): Promise<CatalogSearchResponse>
    search(query: string): Promise<CatalogSearchResponse>
    getMovie(id: number): Promise<CatalogMovieResponse>
    genreRails(): Promise<CatalogGenreRailsResponse>
    discoverGenre(genreId: number): Promise<CatalogSearchResponse>
  }
  torrent: {
    search(input: TorrentSearchInput): Promise<TorrentSearchResponse>
    addMovieDownload(payload: AddMovieTorrentPayload): Promise<AddMovieTorrentResponse>
    getMovieDownloads(movieId: number): Promise<MovieTorrentDownloadSnapshot[]>
    getAllMovieDownloads(): Promise<MovieTorrentDownloadSnapshot[]>
    removeMovieDownload(
      movieId: number,
      downloadId: string
    ): Promise<{ ok: true } | { ok: false; error: string }>
    startMoviePlayback(movieId: number, downloadId: string): Promise<TorrentStreamStartResponse>
    /** The in-app player closed; a download that finished meanwhile can leave the swarm. */
    endInlinePlayback(): Promise<void>
    /** Per-indexer status from recent searches. */
    providerHealth(): Promise<ProviderHealth[]>
    /** Download folders on disk that hold a video but are missing from the list. */
    scanUntracked(): Promise<UntrackedDownload[]>
    recoverUntracked(
      dir: string,
      movieTitle: string
    ): Promise<{ ok: true } | { ok: false; error: string }>
    deleteUntracked(dir: string): Promise<{ ok: true } | { ok: false; error: string }>
    /** Pushed by the main process whenever any download changes; returns an unsubscribe. */
    onDownloadsUpdate(cb: (rows: MovieTorrentDownloadSnapshot[]) => void): () => void
    setMovieDownloadPaused(
      movieId: number,
      downloadId: string,
      paused: boolean
    ): Promise<{ ok: true } | { ok: false; error: string }>
  }
  history: {
    /** Most recently watched first. */
    list(): Promise<WatchProgress[]>
    get(movieId: number): Promise<WatchProgress | null>
    report(movieId: number, position: number, duration: number): Promise<void>
    clear(movieId: number): Promise<void>
  }
  watchlist: {
    get(): Promise<number[]>
    set(movieId: number, inList: boolean): Promise<number[]>
  }
  mpv: {
    /** Fires when the current mpv session ends (process exit / EOF). */
    onEnd(cb: () => void): () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: PopcornApi
  }
}

export {}
