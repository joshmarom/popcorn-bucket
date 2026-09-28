import { useEffect, useState, type ReactElement } from 'react'
import type { TvShowDetails, TvShowListItem } from '@shared/tv'
import { ShowRail } from '@/components/show-grid'
import { episodeNote, loadShows, showsInProgress } from '@/lib/show-progress'

const RAIL_MAX = 15

type RailShow = TvShowListItem & { note?: string | null; progress?: number | null }

function toListItem(show: TvShowDetails): TvShowListItem {
  return {
    id: show.id,
    name: show.name,
    firstAirYear: show.firstAirYear,
    posterUrl: show.posterUrl,
    overview: show.overview,
    voteAverage: null,
    genres: []
  }
}

function Rail({
  id,
  title,
  shows
}: {
  id: string
  title: string
  shows: RailShow[]
}): ReactElement | null {
  if (shows.length === 0) return null
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <h2 id={id} className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        {title}
      </h2>
      <ShowRail shows={shows} />
    </section>
  )
}

/** Shows with an episode in progress, and "My shows", above the TV grid. */
export function TvPersonalRails(): ReactElement | null {
  const [continuing, setContinuing] = useState<RailShow[]>([])
  const [myShows, setMyShows] = useState<RailShow[]>([])

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const [history, downloads, watchlist] = await Promise.all([
        window.api.history.list(),
        window.api.torrent.getAllMovieDownloads(),
        window.api.showWatchlist.get()
      ])
      const inProgress = showsInProgress(history, downloads).slice(0, RAIL_MAX)
      const listIds = watchlist.slice(0, RAIL_MAX)
      const details = await loadShows([
        ...new Set([...inProgress.map((p) => p.showId), ...listIds])
      ])
      if (cancelled) return
      setContinuing(
        inProgress.flatMap((p) => {
          const show = details.get(p.showId)
          const item: TvShowListItem = show
            ? toListItem(show)
            : {
                id: p.showId,
                name: p.showName,
                firstAirYear: null,
                posterUrl: null,
                overview: '',
                voteAverage: null,
                genres: []
              }
          const share = p.progress.duration > 0 ? p.progress.position / p.progress.duration : null
          return [{ ...item, note: episodeNote(p), progress: share }]
        })
      )
      setMyShows(
        listIds.flatMap((id) => {
          const show = details.get(id)
          return show ? [toListItem(show)] : []
        })
      )
    })()
    return (): void => {
      cancelled = true
    }
  }, [])

  if (continuing.length === 0 && myShows.length === 0) return null
  return (
    <div className="space-y-6 pb-2">
      <Rail id="tv-continue" title="Continue watching" shows={continuing} />
      <Rail id="tv-my-shows" title="My shows" shows={myShows} />
    </div>
  )
}
