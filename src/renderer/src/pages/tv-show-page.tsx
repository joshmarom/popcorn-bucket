import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bookmark, BookmarkCheck, Loader2, Play } from 'lucide-react'
import { seasonLabel } from '@shared/tv-meta'
import { rankEpisodeSources } from '@shared/release-ranking'
import type { TorrentSource } from '@shared/torrent'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import type { TorrentSubtitleTrack } from '@shared/torrent-stream'
import {
  episodeCode,
  episodeMediaKey,
  type TvEpisode,
  type TvSeasonDetails,
  type TvShowDetails
} from '@shared/tv'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { Button } from '@/components/ui/button'
import { acknowledgeNetworkNotice, hasAcknowledgedNetworkNotice } from '@/lib/network-notice'
import { cn } from '@/lib/utils'
import { MoviePageShell } from './movie/movie-page-shell'
import { MoviePlaybackDialog } from './movie/movie-playback-dialog'
import { NetworkNoticeDialog } from './movie/network-notice-dialog'

type EpisodeStatus =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'buffering'; downloadId: string }
  | { phase: 'error'; message: string }

type InlinePlayback = {
  key: number
  url: string
  label: string
  subtitles: TorrentSubtitleTrack[]
  startSeconds: number
}

function mergeResults(lists: TorrentSource[][]): TorrentSource[] {
  const seen = new Set<string>()
  const out: TorrentSource[] = []
  for (const row of lists.flat()) {
    const k = row.magnetUri?.toLowerCase() ?? `${row.providerName}:${row.title}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(row)
  }
  return out
}

export function TvShowPage(): ReactElement {
  const { showId: raw } = useParams<{ showId: string }>()
  const showId = Number.parseInt(raw ?? '', 10)
  const navigate = useNavigate()

  const [show, setShow] = useState<TvShowDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null)
  const [season, setSeason] = useState<TvSeasonDetails | null>(null)
  const [downloads, setDownloads] = useState<MovieTorrentDownloadSnapshot[]>([])
  const [history, setHistory] = useState<Map<number, WatchProgress>>(new Map())
  const [status, setStatus] = useState<Record<number, EpisodeStatus>>({})
  const [inline, setInline] = useState<InlinePlayback | null>(null)
  const [pendingNotice, setPendingNotice] = useState<(() => void) | null>(null)
  const [lastPlayed, setLastPlayed] = useState<TvEpisode | null>(null)
  const [inMyShows, setInMyShows] = useState(false)
  useEffect(() => {
    if (!Number.isFinite(showId)) return
    void window.api.showWatchlist.get().then((ids) => setInMyShows(ids.includes(showId)))
  }, [showId])
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const refreshHistory = useCallback(async (): Promise<void> => {
    const rows = await window.api.history.list()
    setHistory(new Map(rows.map((p) => [p.movieId, p])))
  }, [])

  useEffect(() => {
    if (!Number.isFinite(showId)) return
    void window.api.tv.getShow(showId).then((res) => {
      if (!res.ok) {
        setError(res.error)
        return
      }
      setShow(res.show)
      setSeasonNumber((n) => n ?? res.show.seasons[0]?.seasonNumber ?? null)
    })
    void window.api.torrent.getAllMovieDownloads().then(setDownloads)
    void refreshHistory()
    const offDownloads = window.api.torrent.onDownloadsUpdate(setDownloads)
    const offEnd = window.api.mpv.onEnd(() => void refreshHistory())
    return (): void => {
      offDownloads()
      offEnd()
    }
  }, [showId, refreshHistory])

  useEffect(() => {
    if (seasonNumber == null || !Number.isFinite(showId)) return
    setSeason(null)
    void window.api.tv.getSeason(showId, seasonNumber).then((res) => {
      if (res.ok) setSeason(res.season)
      else setError(res.error)
    })
  }, [showId, seasonNumber])

  const startPlayback = useCallback(async (ep: TvEpisode, downloadId: string): Promise<void> => {
    const key = episodeMediaKey(ep.id)
    const res = await window.api.torrent.startMoviePlayback(key, downloadId)
    if (!res.ok) {
      setStatus((s) => ({ ...s, [key]: { phase: 'error', message: res.error } }))
      return
    }
    setStatus((s) => ({ ...s, [key]: { phase: 'idle' } }))
    setLastPlayed(ep)
    if (res.kind === 'inline') {
      setInline({
        key,
        url: res.streamUrl,
        label: res.fileLabel,
        subtitles: res.subtitles,
        startSeconds: res.startSeconds
      })
    }
  }, [])

  // Start buffering episodes as soon as the main process reports they can play.
  useEffect(() => {
    if (!season) return
    for (const ep of season.episodes) {
      const key = episodeMediaKey(ep.id)
      const st = statusRef.current[key]
      if (st?.phase !== 'buffering') continue
      const d = downloads.find((x) => x.downloadId === st.downloadId)
      if (d?.status === 'error') {
        setStatus((s) => ({
          ...s,
          [key]: { phase: 'error', message: d.errorMessage ?? 'Download failed.' }
        }))
      } else if (d?.canPlay) {
        // Leave buffering before the async start so the next update cannot start it twice.
        statusRef.current = { ...statusRef.current, [key]: { phase: 'idle' } }
        setStatus(statusRef.current)
        void startPlayback(ep, st.downloadId)
      }
    }
  }, [downloads, season, startPlayback])

  const playEpisode = useCallback(
    async (ep: TvEpisode): Promise<void> => {
      if (!show) return
      const key = episodeMediaKey(ep.id)
      const mine = downloads.filter((d) => d.movieId === key && d.status !== 'error')
      const playable = mine.find((d) => d.canPlay)
      if (playable) {
        await startPlayback(ep, playable.downloadId)
        return
      }
      if (mine[0]) {
        setStatus((s) => ({ ...s, [key]: { phase: 'buffering', downloadId: mine[0]!.downloadId } }))
        return
      }

      setStatus((s) => ({ ...s, [key]: { phase: 'searching' } }))
      const code = episodeCode(ep.seasonNumber, ep.episodeNumber)
      const pack = `S${String(ep.seasonNumber).padStart(2, '0')}`
      const searches = await Promise.all(
        [`${show.name} ${code}`, `${show.name} ${pack}`].map((title) =>
          window.api.torrent.search({ title, releaseDate: null, imdbId: show.imdbId })
        )
      )
      const rows = mergeResults(searches.map((r) => (r.ok ? r.results : [])))
      const prefs = await window.api.prefs.get()
      const best = rankEpisodeSources(
        rows,
        { showName: show.name, season: ep.seasonNumber, episode: ep.episodeNumber },
        {
          preferredResolution: prefs.preferredResolution,
          preferredLanguage: prefs.subtitleLanguage
        }
      ).ranked[0]
      if (!best?.magnetUri) {
        setStatus((s) => ({
          ...s,
          [key]: { phase: 'error', message: `No good copy of ${code} found.` }
        }))
        return
      }

      const queue = async (): Promise<void> => {
        const res = await window.api.torrent.addMovieDownload({
          movieId: key,
          movieTitle: `${show.name} ${code} · ${ep.name}`,
          episode: {
            showId: show.id,
            showName: show.name,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber
          },
          magnetUri: best.magnetUri!,
          title: best.title,
          indexerSeeders: best.seeders,
          indexerLeechers: best.leechers
        })
        setStatus((s) => ({
          ...s,
          [key]: res.ok
            ? { phase: 'buffering', downloadId: res.downloadId }
            : { phase: 'error', message: res.error }
        }))
      }
      if (hasAcknowledgedNetworkNotice()) await queue()
      else setPendingNotice(() => () => void queue())
    },
    [show, downloads, startPlayback]
  )

  const nextEpisode = useMemo((): TvEpisode | null => {
    if (!lastPlayed || !season) return null
    const watched = history.get(episodeMediaKey(lastPlayed.id))?.finished
    if (!watched) return null
    const idx = season.episodes.findIndex((e) => e.id === lastPlayed.id)
    return idx >= 0 ? (season.episodes[idx + 1] ?? null) : null
  }, [lastPlayed, season, history])

  const nextSeasonNumber = useMemo(() => {
    if (!show || !lastPlayed || !season || nextEpisode) return null
    const watched = history.get(episodeMediaKey(lastPlayed.id))?.finished
    const isLast = season.episodes[season.episodes.length - 1]?.id === lastPlayed.id
    if (!watched || !isLast) return null
    return show.seasons.find((s) => s.seasonNumber > lastPlayed.seasonNumber)?.seasonNumber ?? null
  }, [show, lastPlayed, season, nextEpisode, history])

  if (!Number.isFinite(showId)) {
    return (
      <MoviePageShell backdropImageUrl={null} onBack={() => navigate(-1)}>
        <p className="text-destructive text-sm">Invalid show id.</p>
      </MoviePageShell>
    )
  }

  return (
    <MoviePageShell backdropImageUrl={show?.backdropUrl ?? null} onBack={() => navigate(-1)}>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!show && !error && <p className="text-muted-foreground text-sm">Loading…</p>}
      {show && (
        <div className="space-y-6">
          <div className="flex gap-6">
            {show.posterUrl && (
              <img src={show.posterUrl} alt="" className="hidden w-40 rounded-md sm:block" />
            )}
            <div className="min-w-0 space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">{show.name}</h1>
              <p className="text-muted-foreground text-sm">
                {[show.firstAirYear, seasonLabel(show.seasons.length)].filter(Boolean).join(' · ')}
              </p>
              <p className="max-w-prose text-sm leading-relaxed">{show.overview}</p>
              <Button
                type="button"
                variant={inMyShows ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5"
                aria-pressed={inMyShows}
                onClick={() => {
                  const next = !inMyShows
                  setInMyShows(next)
                  void window.api.showWatchlist.set(show.id, next)
                }}
              >
                {inMyShows ? (
                  <BookmarkCheck className="size-3.5" />
                ) : (
                  <Bookmark className="size-3.5" />
                )}
                {inMyShows ? 'In My shows' : 'Add to My shows'}
              </Button>
            </div>
          </div>

          {(nextEpisode || nextSeasonNumber != null) && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3">
              <span className="text-sm">
                Up next:{' '}
                {nextEpisode
                  ? `${episodeCode(nextEpisode.seasonNumber, nextEpisode.episodeNumber)} · ${nextEpisode.name}`
                  : `Season ${nextSeasonNumber}`}
              </span>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (nextEpisode) void playEpisode(nextEpisode)
                  else if (nextSeasonNumber != null) setSeasonNumber(nextSeasonNumber)
                }}
              >
                <Play className="size-3.5" />
                {nextEpisode ? 'Play' : 'Open season'}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-b border-border pb-2">
            {show.seasons.map((s) => (
              <Button
                key={s.seasonNumber}
                type="button"
                size="sm"
                variant={s.seasonNumber === seasonNumber ? 'default' : 'ghost'}
                className={cn(s.seasonNumber !== seasonNumber && 'text-muted-foreground')}
                onClick={() => setSeasonNumber(s.seasonNumber)}
              >
                {s.name}
              </Button>
            ))}
          </div>

          {!season && <p className="text-muted-foreground text-sm">Loading episodes…</p>}
          {season && (
            <ul className="space-y-2">
              {season.episodes.map((ep) => {
                const key = episodeMediaKey(ep.id)
                const st = status[key] ?? { phase: 'idle' }
                const progress = history.get(key)
                const dl = downloads.find((d) => d.movieId === key && d.status !== 'error')
                const busy = st.phase === 'searching' || st.phase === 'buffering'
                const resume = resumePosition(progress)
                return (
                  <li
                    key={ep.id}
                    className="flex items-center gap-4 rounded-lg border border-border bg-card/40 p-3"
                  >
                    <div className="bg-muted relative hidden aspect-video w-36 shrink-0 overflow-hidden rounded sm:block">
                      {ep.stillUrl && (
                        <img src={ep.stillUrl} alt="" className="size-full object-cover" />
                      )}
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
                        {st.phase === 'error' && (
                          <span className="text-destructive">{st.message}</span>
                        )}
                        {st.phase === 'idle' && progress?.finished && 'Watched'}
                        {st.phase === 'idle' &&
                          !progress?.finished &&
                          dl?.status === 'complete' &&
                          'Downloaded'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 gap-1.5"
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
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <NetworkNoticeDialog
        open={pendingNotice != null}
        onCancel={() => setPendingNotice(null)}
        onConfirm={() => {
          acknowledgeNetworkNotice()
          const run = pendingNotice
          setPendingNotice(null)
          run?.()
        }}
      />

      <MoviePlaybackDialog
        open={inline != null}
        playUrl={inline?.url ?? null}
        playLabel={inline?.label ?? ''}
        playSubtitles={inline?.subtitles ?? []}
        playError={null}
        startSeconds={inline?.startSeconds ?? 0}
        onProgress={(position, duration) => {
          if (inline) void window.api.history.report(inline.key, position, duration)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setInline(null)
            void window.api.torrent.endInlinePlayback()
            void refreshHistory()
          }
        }}
        onPlayerError={() => {}}
      />
    </MoviePageShell>
  )
}
