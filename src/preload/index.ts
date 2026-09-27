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
  MovieTorrentDownloadSnapshot
} from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse } from '@shared/torrent-stream'

const api = {
  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    openVidkingEmbed: (url: string): Promise<void> =>
      ipcRenderer.invoke('app:openVidkingEmbed', url),
    clearVidkingData: (): Promise<void> => ipcRenderer.invoke('app:clearVidkingData'),
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
    set: (partial: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke('settings:set', partial)
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
    setMovieDownloadPaused: (
      movieId: number,
      downloadId: string,
      paused: boolean
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('torrent:setMovieDownloadPaused', { movieId, downloadId, paused })
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
