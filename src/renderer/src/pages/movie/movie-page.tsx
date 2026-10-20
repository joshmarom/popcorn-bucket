import { useContext, useEffect, useMemo, useState, type ReactElement } from 'react'
import { DetailReveal, MovieDetailPlaceholder } from '@/components/detail-placeholder'
import { useDetailReveal } from '@/hooks/use-detail-reveal'
import { PanelReveal } from '@/components/interaction-motion'
import { resumePosition } from '@shared/watch-history'
import { useLocation, useParams } from 'react-router-dom'
import {
  partStyle,
  posterStyle,
  titleStyle,
  useActivePoster,
  useScreenTransition
} from '@/lib/screen-transition'
import { useShallow } from 'zustand/react/shallow'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { createMoviePageStore, getRankedSources, type QuickPlayState } from './movie-page-store'
import { QuickPlayBar } from './quick-play-bar'
import { MoviePageStoreContext, useMoviePageStore } from './movie-page-store-context'
import { DeleteDownloadDialog } from './delete-download-dialog'
import { MovieDetailTabs } from './movie-detail-tabs'
import { MovieDownloadsSection } from './movie-downloads-section'
import { MovieOverviewTab } from './movie-overview-tab'
import { MoviePageShell } from './movie-page-shell'
import { MovieTorrentSourcesSection } from './movie-torrent-sources-section'
import { MovieVidkingTab } from './movie-vidking-tab'
import { NetworkNoticeDialog } from './network-notice-dialog'
import type { RankedTorrentSource } from '@shared/release-ranking'

function pickExistingDownload(
  downloads: MovieTorrentDownloadSnapshot[]
): MovieTorrentDownloadSnapshot | null {
  return (
    downloads.find((d) => d.status === 'complete' && d.canPlay) ??
    downloads.find((d) => d.status !== 'error') ??
    null
  )
}

function pickBufferingDownload(
  downloads: MovieTorrentDownloadSnapshot[],
  quickPlay: QuickPlayState
): MovieTorrentDownloadSnapshot | null {
  if (quickPlay.phase !== 'buffering') return null
  return downloads.find((d) => d.downloadId === quickPlay.downloadId) ?? null
}

function ConnectedQuickPlayBar({
  best,
  resumeSeconds,
  inWatchlist,
  onToggleWatchlist
}: {
  best: RankedTorrentSource | null
  resumeSeconds: number
  inWatchlist: boolean
  onToggleWatchlist: () => void
}): ReactElement {
  const quickPlay = useMoviePageStore((s) => s.quickPlay)
  const playBusy = useMoviePageStore((s) => s.playBusyDownloadId != null)
  const existingDownload = useMoviePageStore((s) => pickExistingDownload(s.downloads))
  const bufferingDownload = useMoviePageStore((s) =>
    pickBufferingDownload(s.downloads, s.quickPlay)
  )
  const playBest = useMoviePageStore((s) => s.playBest)
  const setTab = useMoviePageStore((s) => s.setTab)
  const resetQuickPlay = useMoviePageStore((s) => s.resetQuickPlay)
  return (
    <QuickPlayBar
      quickPlay={quickPlay}
      best={best}
      existingDownload={existingDownload}
      bufferingDownload={bufferingDownload}
      playBusy={playBusy}
      resumeSeconds={resumeSeconds}
      inWatchlist={inWatchlist}
      onToggleWatchlist={onToggleWatchlist}
      onPlay={() => void playBest()}
      onShowSources={() => setTab('sources')}
      onUseVidking={() => setTab('vidking')}
      onDismiss={resetQuickPlay}
    />
  )
}

function MovieDownloadsLive(): ReactElement {
  const downloads = useMoviePageStore((s) => s.downloads)
  const downloadsRefreshBusy = useMoviePageStore((s) => s.downloadsRefreshBusy)
  const playError = useMoviePageStore((s) => s.playError)
  const playDialogOpen = useMoviePageStore((s) => s.playDialogOpen)
  const playBusyDownloadId = useMoviePageStore((s) => s.playBusyDownloadId)
  const pauseBusyDownloadId = useMoviePageStore((s) => s.pauseBusyDownloadId)
  const refreshDownloadsList = useMoviePageStore((s) => s.refreshDownloadsList)
  const beginPlayback = useMoviePageStore((s) => s.beginPlayback)
  const setDownloadPaused = useMoviePageStore((s) => s.setDownloadPaused)
  const setDeleteConfirmId = useMoviePageStore((s) => s.setDeleteConfirmId)
  return (
    <MovieDownloadsSection
      downloads={downloads}
      downloadsRefreshBusy={downloadsRefreshBusy}
      playError={playError}
      playDialogOpen={playDialogOpen}
      playBusyDownloadId={playBusyDownloadId}
      pauseBusyDownloadId={pauseBusyDownloadId}
      onRefresh={refreshDownloadsList}
      onPlay={(downloadId) => void beginPlayback(downloadId)}
      onPause={(downloadId) => void setDownloadPaused(downloadId, true)}
      onResume={(downloadId) => void setDownloadPaused(downloadId, false)}
      onDeleteClick={setDeleteConfirmId}
    />
  )
}

function MovieDeleteDownloadDialog(): ReactElement {
  const deleteConfirmId = useMoviePageStore((s) => s.deleteConfirmId)
  const deleteBusy = useMoviePageStore((s) => s.deleteBusy)
  const titleToDelete = useMoviePageStore((s) =>
    s.deleteConfirmId == null
      ? ''
      : (s.downloads.find((row) => row.downloadId === s.deleteConfirmId)?.displayTitle ?? '')
  )
  const setDeleteConfirmId = useMoviePageStore((s) => s.setDeleteConfirmId)
  const confirmRemoveDownload = useMoviePageStore((s) => s.confirmRemoveDownload)
  return (
    <DeleteDownloadDialog
      open={deleteConfirmId != null}
      deleteBusy={deleteBusy}
      titleToDelete={titleToDelete}
      onOpenChange={(open) => {
        if (!open && !deleteBusy) setDeleteConfirmId(null)
      }}
      onCancel={() => setDeleteConfirmId(null)}
      onConfirm={() => void confirmRemoveDownload()}
    />
  )
}

function MoviePageContent(): ReactElement {
  const store = useContext(MoviePageStoreContext)
  const location = useLocation()
  const poster = useActivePoster()
  const { go } = useScreenTransition()
  if (store == null) {
    throw new Error('MoviePageContent requires MoviePageStoreContext')
  }

  const s = useMoviePageStore(
    useShallow(({ downloads, ...rest }) => {
      void downloads
      return rest
    })
  )

  useEffect(() => {
    void store.getState().loadCatalog()
  }, [store])

  const [inWatchlist, setInWatchlist] = useState(false)
  const [resumeSeconds, setResumeSeconds] = useState(0)
  useEffect(() => {
    const refresh = (): void => {
      void window.api.history.get(s.movieId).then((p) => setResumeSeconds(resumePosition(p)))
    }
    void window.api.watchlist.get().then((ids) => setInWatchlist(ids.includes(s.movieId)))
    refresh()
    const offEnd = window.api.mpv.onEnd(refresh)
    return offEnd
  }, [s.movieId])

  useEffect(() => {
    return window.api.torrent.onDownloadsUpdate((rows) => {
      const movieId = store.getState().movieId
      store.setState({ downloads: rows.filter((r) => r.movieId === movieId) })
      store.getState().advanceQuickPlay()
    })
  }, [store])

  useEffect(() => {
    void window.api.torrent.getMovieDownloads(s.movieId).then((rows) => {
      store.setState({ downloads: rows })
      store.getState().advanceQuickPlay()
    })
    void window.api.prefs.get().then((p) => {
      store.getState().setRankingPrefs({
        preferredResolution: p.preferredResolution,
        preferredLanguage: p.subtitleLanguage
      })
    })
  }, [s.movieId, store])

  useEffect(() => {
    // Reset the "now playing in mpv" pill when mpv closes on its own.
    return window.api.mpv.onEnd(() => {
      store.getState().clearExternalPlayback()
    })
  }, [store])

  const rankedSources = useMemo(
    () => getRankedSources(s.torrentData, s.detail, s.rankingPrefs),
    [s.torrentData, s.detail, s.rankingPrefs]
  )

  const backdropSlides = s.detail?.backdropUrls
  const backdropImageUrl =
    s.detail == null
      ? null
      : backdropSlides && backdropSlides.length > 0
        ? backdropSlides
        : (s.detail.backdropUrl ?? s.detail.posterUrl)

  const navState = location.state as {
    vtPosterUrl?: string | null
    vtTitle?: string | null
    vtMeta?: string | null
    vtGenres?: string[] | null
  } | null
  const previewPoster = navState?.vtPosterUrl ?? null
  const previewTitle = navState?.vtTitle ?? s.detail?.title ?? null
  const posterName = `poster-movie-${s.movieId}`
  const headingName = `title-movie-${s.movieId}`
  const previewSrc = s.detail?.posterUrl ?? previewPoster
  const [tabsMoved, setTabsMoved] = useState(false)
  const showDetail = useDetailReveal(Boolean(s.detail), posterName)

  return (
    <MoviePageShell backdropImageUrl={backdropImageUrl} onBack={() => go(-1, posterName)}>
      {s.error && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {s.error}
        </p>
      )}

      <DetailReveal
        revealed={showDetail}
        placeholder={
          <MovieDetailPlaceholder
            title={previewTitle}
            meta={navState?.vtMeta}
            genres={navState?.vtGenres ?? undefined}
            partStyle={(part) => partStyle(part, posterName, poster)}
            posterSrc={previewSrc}
            posterStyle={posterStyle(posterName, poster)}
            titleStyle={previewTitle ? titleStyle(headingName, poster) : undefined}
          />
        }
      >
        {showDetail && s.detail && (
          <>
            <div className="mb-4">
              <MovieDetailTabs
                tab={s.tab}
                onTabChange={(tab) => {
                  setTabsMoved(true)
                  s.setTab(tab)
                }}
              />
            </div>

            {s.tab === 'overview' && (
              <PanelReveal instant={!tabsMoved}>
                <MovieOverviewTab
                  detail={s.detail}
                  overviewSubTab={s.overviewSubTab}
                  onOverviewSubTabChange={s.setOverviewSubTab}
                  posterActions={
                    <ConnectedQuickPlayBar
                      best={rankedSources.ranked[0] ?? null}
                      resumeSeconds={resumeSeconds}
                      inWatchlist={inWatchlist}
                      onToggleWatchlist={() => {
                        const next = !inWatchlist
                        setInWatchlist(next)
                        void window.api.watchlist.set(s.movieId, next)
                      }}
                    />
                  }
                />
              </PanelReveal>
            )}

            {s.tab === 'sources' && (
              <PanelReveal instant={!tabsMoved}>
                <div className="space-y-4">
                  <MovieDownloadsLive />
                  <MovieTorrentSourcesSection
                    detailPresent
                    torrentLoading={s.torrentLoading}
                    torrentData={s.torrentData}
                    rankedSources={rankedSources}
                    addFeedback={s.addFeedback}
                    addBusyMagnet={s.addBusyMagnet}
                    onRefreshSources={s.refreshTorrentSources}
                    onQueueDownload={(row) => void s.playSource(row)}
                    onCopyMagnet={(uri) => void s.copyMagnet(uri)}
                  />
                </div>
              </PanelReveal>
            )}

            {s.tab === 'vidking' && (
              <PanelReveal instant={!tabsMoved}>
                <MovieVidkingTab detail={s.detail} />
              </PanelReveal>
            )}
          </>
        )}
      </DetailReveal>

      <MovieDeleteDownloadDialog />

      <NetworkNoticeDialog
        open={s.networkNoticeRow != null}
        onCancel={s.cancelNetworkNotice}
        onConfirm={s.confirmNetworkNotice}
      />
    </MoviePageShell>
  )
}

function MoviePageLoaded({ movieId }: { movieId: number }): ReactElement {
  const useMoviePageStoreHook = useMemo(() => createMoviePageStore(movieId), [movieId])

  return (
    <MoviePageStoreContext.Provider value={useMoviePageStoreHook}>
      <MoviePageContent />
    </MoviePageStoreContext.Provider>
  )
}

export function MoviePage(): ReactElement {
  const { movieId } = useParams<{ movieId: string }>()
  const { go } = useScreenTransition()
  const id = movieId != null ? Number.parseInt(movieId, 10) : Number.NaN
  const invalidId = !Number.isFinite(id) || id < 1

  if (invalidId) {
    return (
      <MoviePageShell backdropImageUrl={null} onBack={() => go(-1)}>
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          Invalid movie id.
        </p>
      </MoviePageShell>
    )
  }

  return <MoviePageLoaded movieId={id} />
}
