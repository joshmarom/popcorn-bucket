import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AuthSignInResult, AuthStatus } from '@shared/auth'
import type {
  CatalogGenreRailsResponse,
  CatalogMovieListFactsResponse,
  CatalogMovieResponse,
  CatalogSearchResponse,
  CatalogTrendingPageResponse
} from '@shared/catalog'
import type { TorrentSearchInput, TorrentSearchResponse } from '@shared/torrent'
import type {
  AddMovieTorrentPayload,
  AddMovieTorrentResponse,
  MovieTorrentDownloadSnapshot,
  UntrackedDownload
} from '@shared/torrent-downloads'
import type { InlinePlayerSession, TorrentStreamStartResponse } from '@shared/torrent-stream'
import type { WatchProgress } from '@shared/watch-history'
import type { Preferences } from '@shared/preferences'
import type { ProviderHealth } from '@shared/provider-health'
import type {
  TvGenreRailsResponse,
  TvListPageResponse,
  TvSearchResponse,
  TvSeasonResponse,
  TvShowListFactsResponse,
  TvShowListResponse,
  TvShowResponse
} from '@shared/tv'
import type {
  AutocompleteResponse,
  AutocompleteSuggestion,
  DiscoverCollectionResponse,
  DiscoverCollectionsResponse,
  DiscoverListResponse,
  DiscoverShowListResponse,
  ResolveSuggestionResponse,
  StreamingService
} from '@shared/discovery'

const api = {
  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    showDownloadInFolder: (downloadId: string): Promise<void> =>
      ipcRenderer.invoke('app:showDownloadInFolder', downloadId)
  },
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:status'),
    signIn: (email: string, password: string): Promise<AuthSignInResult> =>
      ipcRenderer.invoke('auth:signIn', { email, password }),
    signOut: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:signOut'),
    onChange: (cb: (status: AuthStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: AuthStatus): void => cb(status)
      ipcRenderer.on('auth:changed', listener)
      return () => ipcRenderer.removeListener('auth:changed', listener)
    }
  },
  tv: {
    trendingPage: (opts: { page: number; forceRefresh?: boolean }): Promise<TvListPageResponse> =>
      ipcRenderer.invoke('tv:trendingPage', opts),
    searchAll: (query: string): Promise<TvShowListResponse> =>
      ipcRenderer.invoke('tv:searchAll', { query }),
    onTheAir: (): Promise<TvShowListResponse> => ipcRenderer.invoke('tv:onTheAir'),
    genres: (): Promise<{ id: number; name: string }[]> => ipcRenderer.invoke('tv:genres'),
    genreRails: (): Promise<TvGenreRailsResponse> => ipcRenderer.invoke('tv:genreRails'),
    discoverGenre: (genreId: number, page: number): Promise<TvListPageResponse> =>
      ipcRenderer.invoke('tv:discoverGenre', { genreId, page }),
    search: (query: string, page?: number): Promise<TvSearchResponse> =>
      ipcRenderer.invoke('tv:search', { query, page }),
    getShow: (id: number): Promise<TvShowResponse> => ipcRenderer.invoke('tv:getShow', { id }),
    listFacts: (ids: number[]): Promise<TvShowListFactsResponse> =>
      ipcRenderer.invoke('tv:listFacts', { ids }),
    getSeason: (showId: number, seasonNumber: number): Promise<TvSeasonResponse> =>
      ipcRenderer.invoke('tv:getSeason', { showId, seasonNumber })
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
    trendingPage: (opts: {
      page: number
      forceRefresh?: boolean
    }): Promise<CatalogTrendingPageResponse> => ipcRenderer.invoke('catalog:trendingPage', opts),
    search: (query: string): Promise<CatalogSearchResponse> =>
      ipcRenderer.invoke('catalog:search', { query }),
    getMovie: (id: number): Promise<CatalogMovieResponse> =>
      ipcRenderer.invoke('catalog:getMovie', { id }),
    listFacts: (ids: number[]): Promise<CatalogMovieListFactsResponse> =>
      ipcRenderer.invoke('catalog:listFacts', { ids }),
    genreRails: (): Promise<CatalogGenreRailsResponse> => ipcRenderer.invoke('catalog:genreRails'),
    discoverGenre: (genreId: number): Promise<CatalogSearchResponse> =>
      ipcRenderer.invoke('catalog:discoverGenre', { genreId })
  },
  discover: {
    popular: (): Promise<DiscoverListResponse> => ipcRenderer.invoke('discover:popular'),
    popularShows: (): Promise<DiscoverShowListResponse> =>
      ipcRenderer.invoke('discover:popularShows'),
    streamingTopShows: (service: StreamingService): Promise<DiscoverShowListResponse> =>
      ipcRenderer.invoke('discover:streamingTopShows', { service }),
    upcoming: (): Promise<DiscoverListResponse> => ipcRenderer.invoke('discover:upcoming'),
    streamingTop: (service: StreamingService): Promise<DiscoverListResponse> =>
      ipcRenderer.invoke('discover:streamingTop', { service }),
    collections: (): Promise<DiscoverCollectionsResponse> =>
      ipcRenderer.invoke('discover:collections'),
    collection: (id: number): Promise<DiscoverCollectionResponse> =>
      ipcRenderer.invoke('discover:collection', { id }),
    autocomplete: (q: string): Promise<AutocompleteResponse> =>
      ipcRenderer.invoke('discover:autocomplete', { q }),
    resolveSuggestion: (s: AutocompleteSuggestion): Promise<ResolveSuggestionResponse> =>
      ipcRenderer.invoke('discover:resolveSuggestion', {
        id: s.id,
        title: s.title,
        year: s.year,
        contentType: s.contentType
      })
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
    providerHealth: (): Promise<ProviderHealth[]> => ipcRenderer.invoke('torrent:providerHealth'),
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
  showWatchlist: {
    get: (): Promise<number[]> => ipcRenderer.invoke('tvWatchlist:get'),
    set: (showId: number, inList: boolean): Promise<number[]> =>
      ipcRenderer.invoke('tvWatchlist:set', { showId, inList })
  },
  mpv: {
    onEnd: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('mpv:end', listener)
      return () => ipcRenderer.removeListener('mpv:end', listener)
    }
  },
  player: {
    getSession: (): Promise<InlinePlayerSession | null> => ipcRenderer.invoke('player:getSession'),
    onSession: (cb: (session: InlinePlayerSession) => void): (() => void) => {
      const listener = (_e: unknown, session: InlinePlayerSession): void => cb(session)
      ipcRenderer.on('player:session', listener)
      return () => ipcRenderer.removeListener('player:session', listener)
    },
    openInMpv: (position: number): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('player:openInMpv', { position })
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
