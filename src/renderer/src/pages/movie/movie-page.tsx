import { useContext, useEffect, useMemo, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { MediaErrorDetail } from '@vidstack/react'
import { useShallow } from 'zustand/react/shallow'
import { createMoviePageStore, getSortedTorrents } from './movie-page-store'
import { MoviePageStoreContext, useMoviePageStore } from './movie-page-store-context'
import { DeleteDownloadDialog } from './delete-download-dialog'
import { MovieDetailTabs } from './movie-detail-tabs'
import { MovieDownloadsSection } from './movie-downloads-section'
import { MovieOverviewTab } from './movie-overview-tab'
import { MoviePageShell } from './movie-page-shell'
import { MoviePlaybackDialog } from './movie-playback-dialog'
import { MovieTorrentSourcesSection } from './movie-torrent-sources-section'
import { MovieVidkingTab } from './movie-vidking-tab'

function MoviePageContent(): ReactElement {
  const store = useContext(MoviePageStoreContext)
  if (store == null) {
    throw new Error('MoviePageContent requires MoviePageStoreContext')
  }

  const navigate = useNavigate()

  const s = useMoviePageStore(useShallow((x) => x))

  useEffect(() => {
    void store.getState().loadCatalog()
  }, [store])

  useEffect(() => {
    if (s.tab !== 'sources') {
      return
    }
    const tick = (): void => {
      void window.api.torrent.getMovieDownloads(s.movieId).then((rows) => {
        store.setState({ downloads: rows })
      })
    }
    tick()
    const interval = setInterval(tick, 1000)
    return (): void => {
      clearInterval(interval)
    }
  }, [s.tab, s.movieId, store])

  useEffect(() => {
    // Reset the "now playing in mpv" pill when mpv closes on its own.
    return window.api.mpv.onEnd(() => {
      store.getState().clearExternalPlayback()
    })
  }, [store])

  const sortedTorrents = useMemo(() => getSortedTorrents(s.torrentData), [s.torrentData])

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
                sortedTorrents={sortedTorrents}
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

      <MoviePlaybackDialog
        open={s.playDialogOpen}
        playUrl={s.playUrl}
        playLabel={s.playLabel}
        playSubtitles={s.playSubtitles}
        playError={s.playError}
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
