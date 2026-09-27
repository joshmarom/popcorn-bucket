import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

const api = {
  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    openVidkingEmbed: (url: string): Promise<void> =>
      ipcRenderer.invoke('app:openVidkingEmbed', url),
    clearVidkingData: (): Promise<void> => ipcRenderer.invoke('app:clearVidkingData'),
    showDownloadInFolder: (downloadId: string): Promise<void> =>
      ipcRenderer.invoke('app:showDownloadInFolder', downloadId),
    getVidkingDiagnostics: (): Promise<
      {
        at: string
        phase: 'completed' | 'error'
        url: string
        method?: string
        resourceType?: string
        statusCode?: number
        error?: string
      }[]
    > => ipcRenderer.invoke('app:getVidkingDiagnostics')
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    isEncrypted: (): Promise<boolean> => ipcRenderer.invoke('settings:isEncrypted'),
    set: (partial: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke('settings:set', partial)
  },
  prefs: {
    get: (): Promise<Preferences> => ipcRenderer.invoke('prefs:get'),
    set: (
      partial: Partial<Preferences>
    ): Promise<{ ok: true; prefs: Preferences } | { ok: false; error: string }> =>
      ipcRenderer.invoke('prefs:set', partial),
    chooseDownloadDir: (): Promise<string | null> => ipcRenderer.invoke('prefs:chooseDownloadDir'),
    defaultDownloadDir: (): Promise<string> => ipcRenderer.invoke('prefs:defaultDownloadDir')
  },
  catalog: {
    nowPlaying: (opts?: { forceRefresh?: boolean }): Promise<CatalogSearchResponse> =>
      ipcRenderer.invoke('catalog:nowPlaying', opts ?? {}),
    search: (query: string): Promise<CatalogSearchResponse> =>
      ipcRenderer.invoke('catalog:search', { query }),
    getMovie: (id: number): Promise<CatalogMovieResponse> =>
      ipcRenderer.invoke('catalog:getMovie', { id }),
    genreRails: (): Promise<CatalogGenreRailsResponse> => ipcRenderer.invoke('catalog:genreRails'),
    discoverGenre: (genreId: number): Promise<CatalogSearchResponse> =>
      ipcRenderer.invoke('catalog:discoverGenre', { genreId })
  },
  torrent: {
    search: (input: TorrentSearchInput): Promise<TorrentSearchResponse> =>
      ipcRenderer.invoke('torrent:search', input),
    addMovieDownload: (payload: AddMovieTorrentPayload): Promise<AddMovieTorrentResponse> =>
      ipcRenderer.invoke('torrent:addMovieDownload', payload),
    getMovieDownloads: (movieId: number): Promise<MovieTorrentDownloadSnapshot[]> =>
      ipcRenderer.invoke('torrent:getMovieDownloads', { id: movieId }),
    getAllMovieDownloads: (): Promise<MovieTorrentDownloadSnapshot[]> =>
      ipcRenderer.invoke('torrent:getAllMovieDownloads'),
    removeMovieDownload: (
      movieId: number,
      downloadId: string
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('torrent:removeMovieDownload', { movieId, downloadId }),
    startMoviePlayback: (
      movieId: number,
      downloadId: string
    ): Promise<TorrentStreamStartResponse> =>
      ipcRenderer.invoke('torrent:startMoviePlayback', { movieId, downloadId }),
    endInlinePlayback: (): Promise<void> => ipcRenderer.invoke('torrent:endInlinePlayback'),
    scanUntracked: (): Promise<UntrackedDownload[]> =>
      ipcRenderer.invoke('downloads:scanUntracked'),
    recoverUntracked: (
      dir: string,
      movieTitle: string
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('downloads:recoverUntracked', { dir, movieTitle }),
    deleteUntracked: (dir: string): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('downloads:deleteUntracked', dir),
    onDownloadsUpdate: (cb: (rows: MovieTorrentDownloadSnapshot[]) => void): (() => void) => {
      const listener = (_e: unknown, rows: MovieTorrentDownloadSnapshot[]): void => cb(rows)
      ipcRenderer.on('downloads:update', listener)
      return () => ipcRenderer.removeListener('downloads:update', listener)
    },
    setMovieDownloadPaused: (
      movieId: number,
      downloadId: string,
      paused: boolean
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('torrent:setMovieDownloadPaused', { movieId, downloadId, paused })
  },
  history: {
    list: (): Promise<WatchProgress[]> => ipcRenderer.invoke('history:list'),
    get: (movieId: number): Promise<WatchProgress | null> =>
      ipcRenderer.invoke('history:get', { id: movieId }),
    report: (movieId: number, position: number, duration: number): Promise<void> =>
      ipcRenderer.invoke('history:report', { movieId, position, duration }),
    clear: (movieId: number): Promise<void> => ipcRenderer.invoke('history:clear', { id: movieId })
  },
  watchlist: {
    get: (): Promise<number[]> => ipcRenderer.invoke('watchlist:get'),
    set: (movieId: number, inList: boolean): Promise<number[]> =>
      ipcRenderer.invoke('watchlist:set', { movieId, inList })
  },
  mpv: {
    onEnd: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('mpv:end', listener)
      return () => ipcRenderer.removeListener('mpv:end', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
