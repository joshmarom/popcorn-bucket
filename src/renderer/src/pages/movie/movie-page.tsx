import { useContext, useEffect, useMemo, useState, type ReactElement } from 'react'
import { resumePosition } from '@shared/watch-history'
import { useNavigate, useParams } from 'react-router-dom'
import type { MediaErrorDetail } from '@vidstack/react'
import { useShallow } from 'zustand/react/shallow'
import { createMoviePageStore, getRankedSources } from './movie-page-store'
import { QuickPlayBar } from './quick-play-bar'
import { MoviePageStoreContext, useMoviePageStore } from './movie-page-store-context'
import { DeleteDownloadDialog } from './delete-download-dialog'
import { MovieDetailTabs } from './movie-detail-tabs'
import { MovieDownloadsSection } from './movie-downloads-section'
import { MovieOverviewTab } from './movie-overview-tab'
import { MoviePageShell } from './movie-page-shell'
import { MoviePlaybackDialog } from './movie-playback-dialog'
import { MovieTorrentSourcesSection } from './movie-torrent-sources-section'
import { MovieVidkingTab } from './movie-vidking-tab'
import { NetworkNoticeDialog } from './network-notice-dialog'

function MoviePageContent(): ReactElement {
  const store = useContext(MoviePageStoreContext)
  if (store == null) {
    throw new Error('MoviePageContent requires MoviePageStoreContext')
  }

  const navigate = useNavigate()

  const s = useMoviePageStore(useShallow((x) => x))

  useEffect(() => {
    void store.getState().loadCatalog()
    return (): void => {
      if (store.getState().playUrl) void window.api.torrent.endInlinePlayback()
    }
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
    if (!s.playDialogOpen) {
      void window.api.history.get(s.movieId).then((p) => setResumeSeconds(resumePosition(p)))
    }
  }, [s.playDialogOpen, s.movieId])

  useEffect(() => {
    return window.api.torrent.onDownloadsUpdate((rows) => {
      store.setState({ downloads: rows.filter((r) => r.movieId === s.movieId) })
      store.getState().advanceQuickPlay()
    })
  }, [s.movieId, store])

  useEffect(() => {
    void window.api.torrent.getMovieDownloads(s.movieId).then((rows) => {
      store.setState({ downloads: rows })
    })
    void window.api.prefs.get().then((p) => {
      store.getState().setRankingPrefs({ preferredResolution: p.preferredResolution })
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
  const existingDownload =
    s.downloads.find((d) => d.status === 'complete' && d.canPlay) ??
    s.downloads.find((d) => d.status !== 'error') ??
    null
  const bufferingDownload =
    s.quickPlay.phase === 'buffering'
      ? (s.downloads.find(
          (d) => s.quickPlay.phase === 'buffering' && d.downloadId === s.quickPlay.downloadId
        ) ?? null)
      : null

  const backdropImageUrl = s.detail?.backdropUrl ?? s.detail?.posterUrl ?? null

  const deleteTitle =
    s.deleteConfirmId != null
      ? (s.downloads.find((x) => x.downloadId === s.deleteConfirmId)?.displayTitle ?? '')
      : ''

  return (
    <MoviePageShell backdropImageUrl={backdropImageUrl} onBack={() => navigate(-1)}>
      {s.loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {s.error && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {s.error}
        </p>
      )}

      {s.detail && (
        <>
          <MovieDetailTabs tab={s.tab} onTabChange={s.setTab} />

          {s.tab === 'overview' && (
            <MovieOverviewTab
              detail={s.detail}
              overviewSubTab={s.overviewSubTab}
              onOverviewSubTabChange={s.setOverviewSubTab}
              posterActions={
                <QuickPlayBar
                  quickPlay={s.quickPlay}
                  best={rankedSources.ranked[0] ?? null}
                  existingDownload={existingDownload}
                  bufferingDownload={bufferingDownload}
                  playBusy={s.playBusyDownloadId != null}
                  resumeSeconds={resumeSeconds}
                  inWatchlist={inWatchlist}
                  onToggleWatchlist={() => {
                    const next = !inWatchlist
                    setInWatchlist(next)
                    void window.api.watchlist.set(s.movieId, next)
                  }}
                  onPlay={() => void s.playBest()}
                  onShowSources={() => s.setTab('sources')}
                  onUseVidking={() => s.setTab('vidking')}
                  onDismiss={s.resetQuickPlay}
                />
              }
            />
          )}

          {s.tab === 'sources' && (
            <div className="space-y-4">
              <MovieDownloadsSection
                downloads={s.downloads}
                downloadsRefreshBusy={s.downloadsRefreshBusy}
                playError={s.playError}
                playDialogOpen={s.playDialogOpen}
                playBusyDownloadId={s.playBusyDownloadId}
                pauseBusyDownloadId={s.pauseBusyDownloadId}
                onRefresh={s.refreshDownloadsList}
                onPlay={(downloadId) => void s.beginPlayback(downloadId)}
                onPause={(downloadId) => void s.setDownloadPaused(downloadId, true)}
                onResume={(downloadId) => void s.setDownloadPaused(downloadId, false)}
                onDeleteClick={s.setDeleteConfirmId}
              />
              <MovieTorrentSourcesSection
                detailPresent
                torrentLoading={s.torrentLoading}
                torrentData={s.torrentData}
                rankedSources={rankedSources}
                addFeedback={s.addFeedback}
                addBusyMagnet={s.addBusyMagnet}
                onRefreshSources={s.refreshTorrentSources}
                onQueueDownload={(row) => void s.queueDownload(row)}
                onCopyMagnet={(uri) => void s.copyMagnet(uri)}
                onOpenDetails={(url) => void s.openDetails(url)}
              />
            </div>
          )}

          {s.tab === 'vidking' && <MovieVidkingTab detail={s.detail} />}
        </>
      )}

      <DeleteDownloadDialog
        open={s.deleteConfirmId != null}
        deleteBusy={s.deleteBusy}
        titleToDelete={deleteTitle}
        onOpenChange={(open) => {
          if (!open && !s.deleteBusy) s.setDeleteConfirmId(null)
        }}
        onCancel={() => s.setDeleteConfirmId(null)}
        onConfirm={() => void s.confirmRemoveDownload()}
      />

      <NetworkNoticeDialog
        open={s.networkNoticeRow != null}
        onCancel={s.cancelNetworkNotice}
        onConfirm={s.confirmNetworkNotice}
      />

      <MoviePlaybackDialog
        open={s.playDialogOpen}
        playUrl={s.playUrl}
        playLabel={s.playLabel}
        playSubtitles={s.playSubtitles}
        playError={s.playError}
        startSeconds={s.playStartSeconds}
        onProgress={(position, duration) =>
          void window.api.history.report(s.movieId, position, duration)
        }
        onOpenChange={s.closePlayDialog}
        onPlayerError={(d: MediaErrorDetail) => {
          const msg = d.message || 'Video playback failed.'
          const code = d.code
          s.setPlayErrorFromPlayer(code != null ? `${msg} (code ${code})` : msg)
        }}
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
  const navigate = useNavigate()
  const id = movieId != null ? Number.parseInt(movieId, 10) : Number.NaN
  const invalidId = !Number.isFinite(id) || id < 1

  if (invalidId) {
    return (
      <MoviePageShell backdropImageUrl={null} onBack={() => navigate(-1)}>
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          Invalid movie id.
        </p>
      </MoviePageShell>
    )
  }

  return <MoviePageLoaded movieId={id} />
}
