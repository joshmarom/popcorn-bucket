import { useContext, useEffect, useMemo, useState, type ReactElement } from 'react'
import { DetailReveal, MovieDetailPlaceholder } from '@/components/detail-placeholder'
import { useDetailReveal } from '@/hooks/use-detail-reveal'
import { PanelReveal } from '@/components/interaction-motion'
import { resumePosition } from '@shared/watch-history'
import { useLocation, useParams } from 'react-router-dom'
import { partStyle, posterStyle, titleStyle, useScreenTransition } from '@/lib/screen-transition'
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
  const location = useLocation()
  const { poster, go } = useScreenTransition()
  if (store == null) {
    throw new Error('MoviePageContent requires MoviePageStoreContext')
  }

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

  const backdropSlides = s.detail?.backdropUrls
  const backdropImageUrl =
    s.detail == null
      ? null
      : backdropSlides && backdropSlides.length > 0
        ? backdropSlides
        : (s.detail.backdropUrl ?? s.detail.posterUrl)

  const deleteTitle =
    s.deleteConfirmId != null
      ? (s.downloads.find((x) => x.downloadId === s.deleteConfirmId)?.displayTitle ?? '')
      : ''
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
              </PanelReveal>
            )}

            {s.tab === 'sources' && (
              <PanelReveal instant={!tabsMoved}>
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
