import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import type { UseBoundStore } from 'zustand/react'
import type { CatalogMovieDetails } from '@shared/catalog'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import type { TorrentSearchErrorCode, TorrentSearchResponse, TorrentSource } from '@shared/torrent'
import type { TorrentSubtitleTrack } from '@shared/torrent-stream'
import { isValidMagnetUri } from '@shared/torrent'
import type { DetailTab, OverviewSubTab } from './movie-types'

export function getSortedTorrents(torrentData: TorrentSearchResponse | null): TorrentSource[] {
  if (!torrentData || !torrentData.ok) return []
  return [...torrentData.results].sort((a, b) => b.seeders - a.seeders)
}

type MoviePageState = {
  movieId: number
  detail: CatalogMovieDetails | null
  loading: boolean
  error: string | null
  tab: DetailTab
  overviewSubTab: OverviewSubTab
  torrentLoading: boolean
  torrentData: TorrentSearchResponse | null
  downloads: MovieTorrentDownloadSnapshot[]
  addBusyMagnet: string | null
  addFeedback: string | null
  playDialogOpen: boolean
  playUrl: string | null
  playLabel: string
  playSubtitles: TorrentSubtitleTrack[]
  playError: string | null
  playBusyDownloadId: string | null
  playbackDownloadId: string | null
  /** True while an external mpv session owned by this page is running. */
  externalPlaybackActive: boolean
  pauseBusyDownloadId: string | null
  downloadsRefreshBusy: boolean
  deleteConfirmId: string | null
  deleteBusy: boolean
}

type MoviePageActions = {
  loadCatalog: () => Promise<void>
  setTab: (t: DetailTab) => void
  setOverviewSubTab: (t: OverviewSubTab) => void
  runTorrentSearch: (forceRefresh: boolean) => Promise<void>
  refreshTorrentSources: () => void
  refreshDownloadsList: () => void
  closePlayDialog: (open: boolean) => void
  setPlayErrorFromPlayer: (message: string) => void
  queueDownload: (row: TorrentSource) => Promise<void>
  beginPlayback: (downloadId: string) => Promise<void>
  removeDownload: (downloadId: string) => Promise<boolean>
  confirmRemoveDownload: () => Promise<void>
  setDownloadPaused: (downloadId: string, paused: boolean) => Promise<void>
  /** Called when the main process notifies us that mpv has exited. */
  clearExternalPlayback: () => void
  setDeleteConfirmId: (id: string | null) => void
  copyMagnet: (uri: string) => Promise<void>
  openDetails: (url: string) => Promise<void>
}

export type MoviePageSlice = MoviePageState & MoviePageActions

export type MoviePageStoreApi = UseBoundStore<StoreApi<MoviePageSlice>>

function initialState(movieId: number): MoviePageState {
  return {
    movieId,
    detail: null,
    loading: true,
    error: null,
    tab: 'overview',
    overviewSubTab: 'cast',
    torrentLoading: false,
    torrentData: null,
    downloads: [],
    addBusyMagnet: null,
    addFeedback: null,
    playDialogOpen: false,
    playUrl: null,
    playLabel: '',
    playSubtitles: [],
    playError: null,
    playBusyDownloadId: null,
    playbackDownloadId: null,
    externalPlaybackActive: false,
    pauseBusyDownloadId: null,
    downloadsRefreshBusy: false,
    deleteConfirmId: null,
    deleteBusy: false
  }
}

export function createMoviePageStore(movieId: number): MoviePageStoreApi {
  return create<MoviePageState & MoviePageActions>((set, get) => ({
    ...initialState(movieId),

    loadCatalog: async () => {
      const id = get().movieId
      set({ loading: true, error: null, detail: null })
      try {
        const res = await window.api.catalog.getMovie(id)
        if (res.ok) {
          set({ loading: false, detail: res.movie, error: null })
          if (get().tab === 'sources') {
            set({ torrentLoading: true, torrentData: null })
            await get().runTorrentSearch(false)
          }
        } else {
          set({ loading: false, error: res.error, detail: null })
        }
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load movie.',
          detail: null
        })
      }
    },

    setTab: (t) => {
      const prev = get().tab
      set({ tab: t })
      if (t === 'sources' && t !== prev) {
        const d = get().detail
        if (d) {
          set({ torrentLoading: true, torrentData: null })
          void get().runTorrentSearch(false)
        }
      }
    },

    setOverviewSubTab: (t) => set({ overviewSubTab: t }),

    runTorrentSearch: async (forceRefresh: boolean): Promise<void> => {
      const detail = get().detail
      if (!detail) return
      set({ torrentLoading: true, torrentData: null })
      try {
        const res = await window.api.torrent.search({
          title: detail.title,
          releaseDate: detail.releaseDate,
          imdbId: detail.imdbId,
          ...(forceRefresh ? { forceRefresh: true as const } : {})
        })
        set({ torrentLoading: false, torrentData: res })
      } catch (e) {
        const code: TorrentSearchErrorCode = 'NETWORK'
        set({
          torrentLoading: false,
          torrentData: {
            ok: false,
            error: e instanceof Error ? e.message : 'Search failed.',
            code
          }
        })
      }
    },

    refreshTorrentSources: () => {
      if (get().tab !== 'sources' || !get().detail) return
      void get().runTorrentSearch(true)
    },

    refreshDownloadsList: () => {
      const id = get().movieId
      set({ downloadsRefreshBusy: true })
      void window.api.torrent.getMovieDownloads(id).then((rows) => {
        set({ downloads: rows, downloadsRefreshBusy: false })
      })
    },

    closePlayDialog: (open) => {
      if (!open) {
        set({
          playDialogOpen: false,
          playUrl: null,
          playLabel: '',
          playSubtitles: [],
          playError: null,
          playbackDownloadId: null
        })
      } else {
        set({ playDialogOpen: true })
      }
    },

    setPlayErrorFromPlayer: (message) => set({ playError: message }),

    queueDownload: async (row) => {
      if (!row.magnetUri || !isValidMagnetUri(row.magnetUri)) return
      const id = get().movieId
      set({ addBusyMagnet: row.magnetUri, addFeedback: null })
      try {
        const res = await window.api.torrent.addMovieDownload({
          movieId: id,
          magnetUri: row.magnetUri,
          title: row.title,
          indexerSeeders: row.seeders,
          indexerLeechers: row.leechers
        })
        if (res.ok) {
          set({ addFeedback: 'Download queued — see above.' })
          window.setTimeout(() => set({ addFeedback: null }), 2800)
        } else {
          set({ addFeedback: res.error })
        }
      } catch (e) {
        set({
          addFeedback: e instanceof Error ? e.message : 'Could not queue download.'
        })
      } finally {
        set({ addBusyMagnet: null })
      }
    },

    beginPlayback: async (downloadId) => {
      const id = get().movieId
      set({ playBusyDownloadId: downloadId, playError: null })
      try {
        const res = await window.api.torrent.startMoviePlayback(id, downloadId)
        if (!res.ok) {
          set({ playError: res.error, playBusyDownloadId: null })
          return
        }
        if (res.kind === 'external') {
          // mpv is driving playback in its own window; we just track that a
          // session is running so we can clean up if the user deletes the
          // download mid-playback.
          set({
            externalPlaybackActive: true,
            playbackDownloadId: downloadId,
            playBusyDownloadId: null,
            addFeedback: `Playing “${res.fileLabel}” in mpv.`
          })
          window.setTimeout(() => {
            if (get().addFeedback?.startsWith('Playing ')) set({ addFeedback: null })
          }, 2800)
          return
        }
        set({
          playUrl: res.streamUrl,
          playLabel: res.fileLabel,
          playSubtitles: res.subtitles,
          playbackDownloadId: downloadId,
          playDialogOpen: true,
          playBusyDownloadId: null
        })
      } catch (e) {
        set({
          playError: e instanceof Error ? e.message : 'Could not start playback.',
          playBusyDownloadId: null
        })
      }
    },

    removeDownload: async (downloadId) => {
      const id = get().movieId
      const res = await window.api.torrent.removeMovieDownload(id, downloadId)
      if (!res.ok) {
        set({ addFeedback: res.error })
        return false
      }
      if (get().playbackDownloadId === downloadId) {
        if (get().externalPlaybackActive) {
          // Main process will emit 'mpv:end' after we stop it; clear state now
          // so the UI feels responsive.
          set({ externalPlaybackActive: false, playbackDownloadId: null })
        } else {
          get().closePlayDialog(false)
        }
      }
      void window.api.torrent.getMovieDownloads(id).then((rows) => set({ downloads: rows }))
      return true
    },

    confirmRemoveDownload: async () => {
      const rid = get().deleteConfirmId
      if (rid == null) return
      set({ deleteBusy: true })
      try {
        if (await get().removeDownload(rid)) set({ deleteConfirmId: null })
      } finally {
        set({ deleteBusy: false })
      }
    },

    setDownloadPaused: async (downloadId, paused) => {
      const id = get().movieId
      set({ pauseBusyDownloadId: downloadId, playError: null })
      try {
        const res = await window.api.torrent.setMovieDownloadPaused(id, downloadId, paused)
        if (!res.ok) {
          set({ playError: res.error })
        }
      } catch (e) {
        set({
          playError: e instanceof Error ? e.message : 'Could not change pause state.'
        })
      } finally {
        set({ pauseBusyDownloadId: null })
        void window.api.torrent.getMovieDownloads(id).then((rows) => set({ downloads: rows }))
      }
    },

    clearExternalPlayback: () => {
      if (!get().externalPlaybackActive) return
      set({ externalPlaybackActive: false, playbackDownloadId: null })
    },

    setDeleteConfirmId: (deleteConfirmId) => set({ deleteConfirmId }),

    copyMagnet: async (uri) => {
      if (!isValidMagnetUri(uri)) return
      await navigator.clipboard.writeText(uri)
    },

    openDetails: async (url) => {
      await window.api.app.openExternal(url)
    }
  }))
}
