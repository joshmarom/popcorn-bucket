import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppSettings, TorrentClawKeyStatus } from '@shared/app-settings'
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
import type { TorrentStreamStartResponse } from '@shared/torrent-stream'
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
    /** Whether TorrentClaw accepted the saved key on the last request. */
    torrentClawKeyStatus(): Promise<TorrentClawKeyStatus>
    set(partial: Partial<AppSettings>): Promise<void>
  }
  tv: {
    /** One page (24 shows) of the endless Trending list. */
    trendingPage(opts: { page: number; forceRefresh?: boolean }): Promise<TvListPageResponse>
    /** Every TMDB result for a query (paged in the browser). */
    searchAll(query: string): Promise<TvShowListResponse>
    onTheAir(): Promise<TvShowListResponse>
    genres(): Promise<{ id: number; name: string }[]>
    genreRails(): Promise<TvGenreRailsResponse>
    discoverGenre(genreId: number, page: number): Promise<TvListPageResponse>
    search(query: string, page?: number): Promise<TvSearchResponse>
    getShow(id: number): Promise<TvShowResponse>
    /** Genres, season count, and status for the show cards on screen. */
    listFacts(ids: number[]): Promise<TvShowListFactsResponse>
    getSeason(showId: number, seasonNumber: number): Promise<TvSeasonResponse>
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
    /** One page of the endless Trending list (24 titles). */
    trendingPage(opts: {
      page: number
      forceRefresh?: boolean
    }): Promise<CatalogTrendingPageResponse>
    search(query: string): Promise<CatalogSearchResponse>
    getMovie(id: number): Promise<CatalogMovieResponse>
    /** Rating, genres, and runtime for the movies currently on screen. */
    listFacts(ids: number[]): Promise<CatalogMovieListFactsResponse>
    genreRails(): Promise<CatalogGenreRailsResponse>
    discoverGenre(genreId: number): Promise<CatalogSearchResponse>
  }
  /** TorrentClaw discovery; every call can fail independently of TMDB. */
  discover: {
    popular(): Promise<DiscoverListResponse>
    popularShows(): Promise<DiscoverShowListResponse>
    streamingTopShows(service: StreamingService): Promise<DiscoverShowListResponse>
    upcoming(): Promise<DiscoverListResponse>
    streamingTop(service: StreamingService): Promise<DiscoverListResponse>
    collections(): Promise<DiscoverCollectionsResponse>
    collection(id: number): Promise<DiscoverCollectionResponse>
    autocomplete(q: string): Promise<AutocompleteResponse>
    /** Route (`/movie/:id`, `/tv/:id`, `/collection/:id`) for a picked suggestion. */
    resolveSuggestion(s: AutocompleteSuggestion): Promise<ResolveSuggestionResponse>
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
  /** "My shows": TMDB show ids, kept apart from the movie watchlist. */
  showWatchlist: {
    get(): Promise<number[]>
    set(showId: number, inList: boolean): Promise<number[]>
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
