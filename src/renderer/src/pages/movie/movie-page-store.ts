import { create } from 'zustand'
import type { StoreApi } from 'zustand'
import type { UseBoundStore } from 'zustand/react'
import type { CatalogMovieDetails } from '@shared/catalog'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import type { TorrentSearchErrorCode, TorrentSearchResponse, TorrentSource } from '@shared/torrent'
import type { TorrentSubtitleTrack } from '@shared/torrent-stream'
import { isValidMagnetUri } from '@shared/torrent'
import { acknowledgeNetworkNotice, hasAcknowledgedNetworkNotice } from '@/lib/network-notice'
import {
  defaultRankingPreferences,
  rankTorrentSources,
  type RankedSources,
  type RankingPreferences
} from '@shared/release-ranking'
import type { DetailTab, OverviewSubTab } from './movie-types'

export function getRankedSources(
  torrentData: TorrentSearchResponse | null,
  detail: CatalogMovieDetails | null,
  prefs: RankingPreferences
): RankedSources {
  if (!torrentData || !torrentData.ok || !detail) return { ranked: [], excluded: [] }
  const year = detail.releaseDate ? Number.parseInt(detail.releaseDate.slice(0, 4), 10) : NaN
  return rankTorrentSources(
    torrentData.results,
    { movieTitle: detail.title, movieYear: Number.isFinite(year) ? year : null },
    prefs
  )
}

/** Progress of the one-click Play flow on the movie page. */
export type QuickPlayState =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'awaiting-notice' }
  | { phase: 'buffering'; downloadId: string }
  | { phase: 'no-sources' }
  | { phase: 'error'; message: string }

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
  playStartSeconds: number
  playError: string | null
  playBusyDownloadId: string | null
  playbackDownloadId: string | null
  /** True while an external mpv session owned by this page is running. */
  externalPlaybackActive: boolean
  pauseBusyDownloadId: string | null
  downloadsRefreshBusy: boolean
  deleteConfirmId: string | null
  deleteBusy: boolean
  /** Source waiting on the one-time network notice before it is queued. */
  networkNoticeRow: TorrentSource | null
  quickPlay: QuickPlayState
  rankingPrefs: RankingPreferences
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
  /** Resolves to the new download id, or null when nothing was queued. */
  queueDownload: (row: TorrentSource) => Promise<string | null>
  /** One-click Play: existing download, else the best-ranked copy. */
  playBest: () => Promise<void>
  /** Play a specific source row: queue it, then start playback once it can stream. */
  playSource: (row: TorrentSource) => Promise<void>
  /** Called on each downloads refresh; starts playback once the buffering copy can play. */
  advanceQuickPlay: () => void
  resetQuickPlay: () => void
  setRankingPrefs: (prefs: RankingPreferences) => void
  confirmNetworkNotice: () => void
  cancelNetworkNotice: () => void
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
    playStartSeconds: 0,
    playError: null,
    playBusyDownloadId: null,
    playbackDownloadId: null,
    externalPlaybackActive: false,
    pauseBusyDownloadId: null,
    downloadsRefreshBusy: false,
    deleteConfirmId: null,
    deleteBusy: false,
    networkNoticeRow: null,
    quickPlay: { phase: 'idle' },
    rankingPrefs: defaultRankingPreferences
  }
}

export function createMoviePageStore(movieId: number): MoviePageStoreApi {
  let searchSeq = 0
  let searchInFlight: Promise<void> | null = null

  return create<MoviePageState & MoviePageActions>((set, get) => ({
    ...initialState(movieId),

    loadCatalog: async () => {
      const id = get().movieId
      set({ loading: true, error: null, detail: null })
      try {
        const res = await window.api.catalog.getMovie(id)
        if (res.ok) {
          set({ loading: false, detail: res.movie, error: null })
          // Start while the overview is open so Sources is usually ready.
          void get().runTorrentSearch(false)
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
      if (t === 'sources' && t !== prev && get().detail) {
        if (!get().torrentData?.ok && !get().torrentLoading) {
          void get().runTorrentSearch(false)
        }
      }
    },

    setOverviewSubTab: (t) => set({ overviewSubTab: t }),

    runTorrentSearch: async (forceRefresh: boolean): Promise<void> => {
      const detail = get().detail
      if (!detail) return
      if (!forceRefresh) {
        if (get().torrentData?.ok) return
        if (searchInFlight) return searchInFlight
      }
      const seq = ++searchSeq
      set({
        torrentLoading: true,
        torrentData: forceRefresh ? null : get().torrentData
      })
      const run = (async (): Promise<void> => {
        try {
          const res = await window.api.torrent.search({
            title: detail.title,
            releaseDate: detail.releaseDate,
            imdbId: detail.imdbId,
            ...(forceRefresh ? { forceRefresh: true as const } : {})
          })
          if (seq !== searchSeq) return
          set({ torrentLoading: false, torrentData: res })
        } catch (e) {
          if (seq !== searchSeq) return
          const code: TorrentSearchErrorCode = 'NETWORK'
          set({
            torrentLoading: false,
            torrentData: {
              ok: false,
              error: e instanceof Error ? e.message : 'Search failed.',
              code
            }
          })
        } finally {
          if (searchSeq === seq) searchInFlight = null
        }
      })()
      searchInFlight = run
      return run
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
        get().advanceQuickPlay()
      })
    },

    closePlayDialog: (open) => {
      if (!open) {
        void window.api.torrent.endInlinePlayback()
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

    confirmNetworkNotice: () => {
      const row = get().networkNoticeRow
      acknowledgeNetworkNotice()
      set({ networkNoticeRow: null })
      if (!row) return
      void get()
        .queueDownload(row)
        .then((downloadId) => {
          if (get().quickPlay.phase !== 'awaiting-notice') return
          set({
            quickPlay: downloadId
              ? { phase: 'buffering', downloadId }
              : { phase: 'error', message: get().addFeedback ?? 'Could not start the download.' }
          })
        })
    },

    cancelNetworkNotice: () => {
      set({ networkNoticeRow: null })
      if (get().quickPlay.phase === 'awaiting-notice') set({ quickPlay: { phase: 'idle' } })
    },

    playBest: async () => {
      const refresh = async (): Promise<MovieTorrentDownloadSnapshot[]> => {
        const rows = await window.api.torrent.getMovieDownloads(get().movieId)
        set({ downloads: rows })
        return rows
      }
      const downloads = await refresh()
      const playable =
        downloads.find((d) => d.status === 'complete' && d.canPlay) ??
        downloads.find((d) => d.canPlay && d.status !== 'error')
      if (playable) {
        set({ quickPlay: { phase: 'idle' } })
        await get().beginPlayback(playable.downloadId)
        return
      }
      const inProgress = downloads.find((d) => d.status !== 'error')
      if (inProgress) {
        set({ quickPlay: { phase: 'buffering', downloadId: inProgress.downloadId } })
        if (inProgress.status === 'paused') {
          await window.api.torrent.setMovieDownloadPaused(
            get().movieId,
            inProgress.downloadId,
            false
          )
        }
        return
      }

      set({ quickPlay: { phase: 'searching' } })
      if (!get().torrentData?.ok) {
        await get().runTorrentSearch(false)
      }
      const best = getRankedSources(get().torrentData, get().detail, get().rankingPrefs).ranked[0]
      if (!best) {
        set({ quickPlay: { phase: 'no-sources' } })
        return
      }
      if (!hasAcknowledgedNetworkNotice()) {
        set({ quickPlay: { phase: 'awaiting-notice' }, networkNoticeRow: best })
        return
      }
      const downloadId = await get().queueDownload(best)
      set({
        quickPlay: downloadId
          ? { phase: 'buffering', downloadId }
          : { phase: 'error', message: get().addFeedback ?? 'Could not start the download.' }
      })
      if (downloadId) get().advanceQuickPlay()
    },

    playSource: async (row) => {
      if (!row.magnetUri || !isValidMagnetUri(row.magnetUri)) return
      if (!hasAcknowledgedNetworkNotice()) {
        set({ networkNoticeRow: row, quickPlay: { phase: 'awaiting-notice' } })
        return
      }
      const downloadId = await get().queueDownload(row)
      set({
        quickPlay: downloadId
          ? { phase: 'buffering', downloadId }
          : { phase: 'error', message: get().addFeedback ?? 'Could not start playback.' }
      })
      if (downloadId) get().advanceQuickPlay()
    },

    advanceQuickPlay: () => {
      const qp = get().quickPlay
      if (qp.phase !== 'buffering') return
      const snap = get().downloads.find((d) => d.downloadId === qp.downloadId)
      if (!snap) return
      if (snap.status === 'error') {
        set({ quickPlay: { phase: 'error', message: snap.errorMessage ?? 'Download failed.' } })
        return
      }
      if (snap.canPlay && get().playBusyDownloadId == null) {
        set({ quickPlay: { phase: 'idle' } })
        void get().beginPlayback(qp.downloadId)
      }
    },

    resetQuickPlay: () => set({ quickPlay: { phase: 'idle' } }),

    setRankingPrefs: (rankingPrefs) => set({ rankingPrefs }),

    queueDownload: async (row) => {
      if (!row.magnetUri || !isValidMagnetUri(row.magnetUri)) return null
      if (!hasAcknowledgedNetworkNotice()) {
        set({ networkNoticeRow: row })
        return null
      }
      const id = get().movieId
      set({ addBusyMagnet: row.magnetUri, addFeedback: null })
      try {
        const res = await window.api.torrent.addMovieDownload({
          movieId: id,
          movieTitle: get().detail?.title ?? '',
          magnetUri: row.magnetUri,
          title: row.title,
          indexerSeeders: row.seeders,
          indexerLeechers: row.leechers
        })
        if (res.ok) {
          set({ addFeedback: 'Buffering this copy. Playback starts when it is ready.' })
          window.setTimeout(() => set({ addFeedback: null }), 2800)
          return res.downloadId
        }
        set({ addFeedback: res.error })
        return null
      } catch (e) {
        set({
          addFeedback: e instanceof Error ? e.message : 'Could not queue download.'
        })
        return null
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
        const playerLabel = res.kind === 'external' ? 'mpv' : 'player window'
        set({
          externalPlaybackActive: true,
          playbackDownloadId: downloadId,
          playBusyDownloadId: null,
          addFeedback: `Playing “${res.fileLabel}” in ${playerLabel}.`
        })
        window.setTimeout(() => {
          if (get().addFeedback?.startsWith('Playing ')) set({ addFeedback: null })
        }, 2800)
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
