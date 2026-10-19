import { useEffect, useRef, useState, type MutableRefObject, type ReactElement } from 'react'
import { Loader2, Play } from 'lucide-react'
import { episodeCode, episodeMediaKey, type TvEpisode, type TvSeasonDetails } from '@shared/tv'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import {
  isSafeTorrentDetailsUrl,
  isValidMagnetUri,
  type TorrentSearchResponse,
  type TorrentSource
} from '@shared/torrent'
import type { RankedSources } from '@shared/release-ranking'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { Button } from '@/components/ui/button'
import { MovieTorrentSourcesSection } from './movie/movie-torrent-sources-section'

export type EpisodeStatus =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'buffering'; downloadId: string }
  | { phase: 'error'; message: string }

function showDownloadSignature(rows: MovieTorrentDownloadSnapshot[]): string {
  return rows
    .map((row) =>
      [
        row.downloadId,
        row.movieId,
        row.status,
        row.canPlay ? 1 : 0,
        row.progress,
        row.numPeers,
        row.errorMessage ?? ''
      ].join(':')
    )
    .sort()
    .join('|')
}

function useShowDownloads(
  showId: number,
  downloadsRef: MutableRefObject<MovieTorrentDownloadSnapshot[]>
): MovieTorrentDownloadSnapshot[] {
  const [downloads, setDownloads] = useState<MovieTorrentDownloadSnapshot[]>([])
  const signatureRef = useRef('')
  useEffect(() => {
    if (!Number.isFinite(showId)) return
    const apply = (rows: MovieTorrentDownloadSnapshot[]): void => {
      const mine = rows.filter((row) => row.episode?.showId === showId)
      const signature = showDownloadSignature(mine)
      downloadsRef.current = mine
      if (signature === signatureRef.current) return
      signatureRef.current = signature
      setDownloads(mine)
    }
    void window.api.torrent.getAllMovieDownloads().then(apply)
    return window.api.torrent.onDownloadsUpdate(apply)
  }, [showId, downloadsRef])
  return downloads
}

export function TvEpisodeList({
  showId,
  season,
  seasonNumber,
  history,
  status,
  statusRef,
  setStatus,
  downloadsRef,
  startPlayback,
  playEpisode,
  vidcoreEpisode,
  setVidcoreEpisode,
  sourcesFor,
  setSourcesFor,
  sourcesLoading,
  sourcesData,
  rankedSources,
  sourceFeedback,
  sourceBusyMagnet,
  searchEpisodeSources,
  queueEpisodeSource
}: {
  showId: number
  season: TvSeasonDetails | null
  seasonNumber: number | null
  history: Map<number, WatchProgress>
  status: Record<number, EpisodeStatus>
  statusRef: MutableRefObject<Record<number, EpisodeStatus>>
  setStatus: (value: Record<number, EpisodeStatus>) => void
  downloadsRef: MutableRefObject<MovieTorrentDownloadSnapshot[]>
  startPlayback: (ep: TvEpisode, downloadId: string) => Promise<void>
  playEpisode: (ep: TvEpisode) => Promise<void>
  vidcoreEpisode: number | null
  setVidcoreEpisode: (episode: number) => void
  sourcesFor: number | null
  setSourcesFor: (episodeId: number | null) => void
  sourcesLoading: boolean
  sourcesData: TorrentSearchResponse | null
  rankedSources: RankedSources
  sourceFeedback: string | null
  sourceBusyMagnet: string | null
  searchEpisodeSources: (ep: TvEpisode, forceRefresh?: boolean) => Promise<void>
  queueEpisodeSource: (ep: TvEpisode, row: TorrentSource) => void
}): ReactElement {
  const downloads = useShowDownloads(showId, downloadsRef)

  useEffect(() => {
    if (!season) return
    for (const ep of season.episodes) {
      const key = episodeMediaKey(ep.id)
      const st = statusRef.current[key]
      if (st?.phase !== 'buffering') continue
      const row = downloads.find((item) => item.downloadId === st.downloadId)
      if (row?.status === 'error') {
        const next = {
          ...statusRef.current,
          [key]: { phase: 'error' as const, message: row.errorMessage ?? 'Download failed.' }
        }
        statusRef.current = next
        setStatus(next)
      } else if (row?.canPlay) {
        statusRef.current = { ...statusRef.current, [key]: { phase: 'idle' } }
        setStatus(statusRef.current)
        void startPlayback(ep, st.downloadId)
      }
    }
  }, [downloads, season, setStatus, startPlayback, statusRef])

  if (!season) {
    return <p className="text-muted-foreground text-sm">Loading episodes…</p>
  }

  return (
    <ul className="space-y-2">
      {season.episodes.map((ep) => {
        const key = episodeMediaKey(ep.id)
        const st = status[key] ?? { phase: 'idle' }
        const progress = history.get(key)
        const dl = downloads.find((row) => row.movieId === key && row.status !== 'error')
        const busy = st.phase === 'searching' || st.phase === 'buffering'
        const resume = resumePosition(progress)
        return (
          <li key={ep.id} className="space-y-3 rounded-lg border border-border bg-card/40 p-3">
            <div className="flex items-center gap-4">
              <div className="bg-muted relative hidden aspect-video w-36 shrink-0 overflow-hidden rounded sm:block">
                {ep.stillUrl && <img src={ep.stillUrl} alt="" className="size-full object-cover" />}
                {progress && progress.duration > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                    <div
                      className="bg-primary h-full"
                      style={{
                        width: `${progress.finished ? 100 : (progress.position / progress.duration) * 100}%`
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {episodeCode(ep.seasonNumber, ep.episodeNumber)} · {ep.name}
                </p>
                <p className="text-muted-foreground line-clamp-2 text-xs">{ep.overview}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {st.phase === 'searching' && 'Finding the best copy…'}
                  {st.phase === 'buffering' &&
                    (dl && dl.status !== 'pending_metadata' && dl.status !== 'queued'
                      ? `Buffering ${Math.round(dl.progress * 100)}% · ${dl.numPeers} peers`
                      : 'Connecting to peers…')}
                  {st.phase === 'error' && <span className="text-destructive">{st.message}</span>}
                  {st.phase === 'idle' && progress?.finished && 'Watched'}
                  {st.phase === 'idle' &&
                    !progress?.finished &&
                    dl?.status === 'complete' &&
                    'Downloaded'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    vidcoreEpisode === ep.episodeNumber && seasonNumber === ep.seasonNumber
                      ? 'secondary'
                      : 'outline'
                  }
                  onClick={() => setVidcoreEpisode(ep.episodeNumber)}
                >
                  VidCore
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sourcesFor === ep.id ? 'secondary' : 'outline'}
                  onClick={() => {
                    if (sourcesFor === ep.id) {
                      setSourcesFor(null)
                      return
                    }
                    void searchEpisodeSources(ep)
                  }}
                >
                  Sources
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => void playEpisode(ep)}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  {resume > 0 ? 'Resume' : 'Play'}
                </Button>
              </div>
            </div>
            {sourcesFor === ep.id && (
              <MovieTorrentSourcesSection
                detailPresent
                torrentLoading={sourcesLoading}
                torrentData={sourcesData}
                rankedSources={rankedSources}
                addFeedback={sourceFeedback}
                addBusyMagnet={sourceBusyMagnet}
                onRefreshSources={() => void searchEpisodeSources(ep, true)}
                onQueueDownload={(row) => queueEpisodeSource(ep, row)}
                onCopyMagnet={(uri) => {
                  if (isValidMagnetUri(uri)) void navigator.clipboard.writeText(uri)
                }}
                onOpenDetails={(url) => {
                  if (isSafeTorrentDetailsUrl(url)) void window.api.app.openExternal(url)
                }}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
