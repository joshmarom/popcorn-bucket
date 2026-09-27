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
  MovieTorrentDownloadSnapshot
} from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse } from '@shared/torrent-stream'

export type PopcornApi = {
  app: {
    openExternal(url: string): Promise<void>
    /** Open (or focus) VidKing in a dedicated top-level Electron window. */
    openVidkingEmbed(url: string): Promise<void>
    /** Clear cookies, storage, and HTTP cache of the isolated VidKing session. */
    clearVidkingData(): Promise<void>
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
    set(partial: Partial<AppSettings>): Promise<void>
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
    setMovieDownloadPaused(
      movieId: number,
      downloadId: string,
      paused: boolean
    ): Promise<{ ok: true } | { ok: false; error: string }>
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
