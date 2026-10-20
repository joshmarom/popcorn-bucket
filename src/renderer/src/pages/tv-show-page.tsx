import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import {
  posterStyle,
  titleStyle,
  useActivePoster,
  useScreenTransition
} from '@/lib/screen-transition'
import { DetailReveal, ShowDetailPlaceholder } from '@/components/detail-placeholder'
import { useDetailReveal } from '@/hooks/use-detail-reveal'
import { Bookmark, BookmarkCheck, Play } from 'lucide-react'
import { IconSwap } from '@/components/interaction-motion'
import { seasonLabel } from '@shared/tv-meta'
import { rankEpisodeSources, type RankedSources } from '@shared/release-ranking'
import type { TorrentSearchResponse, TorrentSource } from '@shared/torrent'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import {
  episodeCode,
  episodeMediaKey,
  type TvEpisode,
  type TvSeasonDetails,
  type TvShowDetails
} from '@shared/tv'
import type { WatchProgress } from '@shared/watch-history'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { acknowledgeNetworkNotice, hasAcknowledgedNetworkNotice } from '@/lib/network-notice'
import { cn } from '@/lib/utils'
import { MoviePageShell } from './movie/movie-page-shell'
import { NetworkNoticeDialog } from './movie/network-notice-dialog'
import { TvCastTrailers } from './tv-cast-trailers'
import { TvEpisodeList, type EpisodeStatus } from './tv-episode-list'

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

/** Show details omit rating and genres; the list-facts payload already has both. */
async function withShowFacts(show: TvShowDetails): Promise<TvShowDetails> {
  const genres = show.genres ?? []
  if (show.voteAverage != null && genres.length > 0) return { ...show, genres }
  const factsRes = await window.api.tv.listFacts([show.id])
  const facts = factsRes.ok ? factsRes.facts.find((row) => row.id === show.id) : undefined
  return {
    ...show,
    genres: genres.length > 0 ? genres : (facts?.genres ?? []),
    voteAverage: show.voteAverage ?? facts?.voteAverage ?? null
  }
}

export function TvShowPage(): ReactElement {
  const { showId: raw } = useParams<{ showId: string }>()
  const showId = Number.parseInt(raw ?? '', 10)
  const location = useLocation()
  const poster = useActivePoster()
  const { go } = useScreenTransition()
  const posterName = `poster-tv-${showId}`
  const headingName = `title-tv-${showId}`
  const navState = location.state as { vtPosterUrl?: string | null; vtTitle?: string | null } | null
  const previewPoster = navState?.vtPosterUrl ?? null
  const [show, setShow] = useState<TvShowDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null)
  const seasonNumberRef = useRef(seasonNumber)
  useEffect(() => {
    seasonNumberRef.current = seasonNumber
  }, [seasonNumber])
  const [season, setSeason] = useState<TvSeasonDetails | null>(null)
  const downloadsRef = useRef<MovieTorrentDownloadSnapshot[]>([])
  const skipSeasonFetch = useRef(false)
  const [history, setHistory] = useState<Map<number, WatchProgress>>(new Map())
  const [status, setStatus] = useState<Record<number, EpisodeStatus>>({})
  const [pendingNotice, setPendingNotice] = useState<(() => void) | null>(null)
  const [lastPlayed, setLastPlayed] = useState<TvEpisode | null>(null)
  const [inMyShows, setInMyShows] = useState(false)
  const [sourcesFor, setSourcesFor] = useState<number | null>(null)
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesData, setSourcesData] = useState<TorrentSearchResponse | null>(null)
  const [rankedSources, setRankedSources] = useState<RankedSources>({ ranked: [], excluded: [] })
  const [sourceBusyMagnet, setSourceBusyMagnet] = useState<string | null>(null)
  const [sourceFeedback, setSourceFeedback] = useState<string | null>(null)
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
    void window.api.tv.getShow(showId).then(async (res) => {
      if (!res.ok) {
        setError(res.error)
        return
      }
      const loaded = await withShowFacts(res.show)
      setShow(loaded)
      const first = loaded.seasons[0]?.seasonNumber ?? null
      if (seasonNumberRef.current == null && first != null) {
        skipSeasonFetch.current = true
        void window.api.tv.getSeason(showId, first).then((seasonRes) => {
          if (seasonRes.ok) setSeason(seasonRes.season)
          else setError(seasonRes.error)
        })
      }
      setSeasonNumber((n) => n ?? first)
    })
    void refreshHistory()
    const offEnd = window.api.mpv.onEnd(() => void refreshHistory())
    return (): void => {
      offEnd()
    }
  }, [showId, refreshHistory])

  useEffect(() => {
    if (seasonNumber == null || !Number.isFinite(showId)) return
    if (skipSeasonFetch.current) {
      skipSeasonFetch.current = false
      return
    }
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
  }, [])

  const playEpisode = useCallback(
    async (ep: TvEpisode): Promise<void> => {
      if (!show) return
      const key = episodeMediaKey(ep.id)
      const mine = downloadsRef.current.filter((d) => d.movieId === key && d.status !== 'error')
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
      const prefsPromise = window.api.prefs.get()
      const searches = await Promise.all(
        [`${show.name} ${code}`, `${show.name} ${pack}`].map((title) =>
          window.api.torrent.search({ title, releaseDate: null, imdbId: show.imdbId })
        )
      )
      const rows = mergeResults(searches.map((r) => (r.ok ? r.results : [])))
      const prefs = await prefsPromise
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
          [key]: {
            phase: 'error',
            message: `No good copy of ${code}. Choose one under Sources.`
          }
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
    [show, startPlayback]
  )

  const searchEpisodeSources = useCallback(
    async (ep: TvEpisode, forceRefresh = false): Promise<void> => {
      if (!show) return
      setSourcesFor(ep.id)
      setSourcesLoading(true)
      setSourceFeedback(null)
      const code = episodeCode(ep.seasonNumber, ep.episodeNumber)
      const pack = `S${String(ep.seasonNumber).padStart(2, '0')}`
      const prefsPromise = window.api.prefs.get()
      const searches = await Promise.all(
        [`${show.name} ${code}`, `${show.name} ${pack}`].map((title) =>
          window.api.torrent.search({
            title,
            releaseDate: null,
            imdbId: show.imdbId,
            forceRefresh
          })
        )
      )
      const rows = mergeResults(searches.map((result) => (result.ok ? result.results : [])))
      const failed = searches.find((result) => !result.ok)
      const prefs = await prefsPromise
      setRankedSources(
        rankEpisodeSources(
          rows,
          { showName: show.name, season: ep.seasonNumber, episode: ep.episodeNumber },
          {
            preferredResolution: prefs.preferredResolution,
            preferredLanguage: prefs.subtitleLanguage
          }
        )
      )
      const cached = searches.find((result) => result.ok && result.cached)
      setSourcesData(
        rows.length > 0 || !failed
          ? {
              ok: true,
              results: rows,
              errors: searches.flatMap((result) => (result.ok ? result.errors : [])),
              cached: cached?.ok ? cached.cached : undefined,
              cachedAtMs: cached?.ok ? cached.cachedAtMs : undefined
            }
          : failed
      )
      setSourcesLoading(false)
    },
    [show]
  )

  const queueEpisodeSource = useCallback(
    async (ep: TvEpisode, row: TorrentSource): Promise<void> => {
      if (!show || !row.magnetUri) return
      const key = episodeMediaKey(ep.id)
      const code = episodeCode(ep.seasonNumber, ep.episodeNumber)
      const magnet = row.magnetUri
      const queue = async (): Promise<void> => {
        setSourceBusyMagnet(magnet)
        const res = await window.api.torrent.addMovieDownload({
          movieId: key,
          movieTitle: `${show.name} ${code} · ${ep.name}`,
          episode: {
            showId: show.id,
            showName: show.name,
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber
          },
          magnetUri: magnet,
          title: row.title,
          indexerSeeders: row.seeders,
          indexerLeechers: row.leechers
        })
        setSourceBusyMagnet(null)
        setSourceFeedback(
          res.ok ? 'Buffering this copy. Playback starts when it is ready.' : res.error
        )
        setStatus((current) => ({
          ...current,
          [key]: res.ok
            ? { phase: 'buffering', downloadId: res.downloadId }
            : { phase: 'error', message: res.error }
        }))
      }
      if (hasAcknowledgedNetworkNotice()) await queue()
      else setPendingNotice(() => () => void queue())
    },
    [show]
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

  const showDetail = useDetailReveal(Boolean(show), posterName)

  if (!Number.isFinite(showId)) {
    return (
      <MoviePageShell backdropImageUrl={null} onBack={() => go(-1, posterName)}>
        <p className="text-destructive text-sm">Invalid show id.</p>
      </MoviePageShell>
    )
  }

  const previewTitle = navState?.vtTitle ?? show?.name ?? null
  return (
    <MoviePageShell backdropImageUrl={show?.backdropUrl ?? null} onBack={() => go(-1, posterName)}>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <DetailReveal
        revealed={showDetail}
        placeholder={
          <ShowDetailPlaceholder
            title={previewTitle}
            posterSrc={show?.posterUrl ?? previewPoster}
            posterStyle={posterStyle(posterName, poster)}
            titleStyle={previewTitle ? titleStyle(headingName, poster) : undefined}
          />
        }
      >
        {show && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
              <div className="space-y-3">
                <Card className="overflow-hidden p-0">
                  <div className="bg-muted aspect-[2/3]">
                    {show.posterUrl ? (
                      <img
                        src={show.posterUrl}
                        alt=""
                        className="size-full object-cover"
                        style={posterStyle(posterName, poster)}
                      />
                    ) : (
                      <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
                        No poster
                      </div>
                    )}
                  </div>
                </Card>
                <Button
                  type="button"
                  variant={inMyShows ? 'secondary' : 'outline'}
                  size="lg"
                  className="w-full gap-1.5"
                  aria-pressed={inMyShows}
                  onClick={() => {
                    const next = !inMyShows
                    setInMyShows(next)
                    void window.api.showWatchlist.set(show.id, next)
                  }}
                >
                  <IconSwap
                    state={inMyShows ? 'b' : 'a'}
                    a={<Bookmark className="size-4" />}
                    b={<BookmarkCheck className="size-4" />}
                  />
                  {inMyShows ? 'In My shows' : 'Add to My shows'}
                </Button>
              </div>
              <div className="min-w-0 space-y-4">
                <div>
                  <h1 className="type-display" style={titleStyle(headingName, poster)}>
                    {show.name}
                  </h1>
                  <p className="type-meta text-muted-foreground mt-2">
                    {[
                      show.firstAirYear,
                      seasonLabel(show.seasons.length),
                      show.voteAverage != null && show.voteAverage > 0
                        ? `★ ${show.voteAverage.toFixed(1)}`
                        : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {(show.genres ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(show.genres ?? []).map((genre) => (
                      <Badge key={genre} variant="secondary">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="type-prose">{show.overview}</p>
                <TvCastTrailers cast={show.cast ?? []} trailers={show.trailers ?? []} />
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

            <TvEpisodeList
              showId={showId}
              season={season}
              history={history}
              status={status}
              statusRef={statusRef}
              setStatus={setStatus}
              downloadsRef={downloadsRef}
              startPlayback={startPlayback}
              playEpisode={playEpisode}
              sourcesFor={sourcesFor}
              setSourcesFor={setSourcesFor}
              sourcesLoading={sourcesLoading}
              sourcesData={sourcesData}
              rankedSources={rankedSources}
              sourceFeedback={sourceFeedback}
              sourceBusyMagnet={sourceBusyMagnet}
              searchEpisodeSources={searchEpisodeSources}
              queueEpisodeSource={(ep, row) => void queueEpisodeSource(ep, row)}
            />
          </div>
        )}
      </DetailReveal>

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
    </MoviePageShell>
  )
}
