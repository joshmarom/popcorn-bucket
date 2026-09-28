import { useEffect, useState, type ReactElement } from 'react'
import type { CatalogMovieDetails } from '@shared/catalog'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { isEpisodeMediaKey } from '@shared/tv'
import { MovieCard } from '@/components/movie-card'
import { MOVIE_RAIL_CLASS, MOVIE_RAIL_ITEM_CLASS } from '@/lib/movie-layout'
import { releaseYearFromDate } from '@/lib/movie-meta'

const RAIL_MAX = 15

type RailItem = { movie: CatalogMovieDetails; progress: WatchProgress | null }

async function loadMovies(ids: number[]): Promise<Map<number, CatalogMovieDetails>> {
  const out = new Map<number, CatalogMovieDetails>()
  const results = await Promise.all(ids.map((id) => window.api.catalog.getMovie(id)))
  results.forEach((res, i) => {
    if (res.ok) out.set(ids[i]!, res.movie)
  })
  return out
}

function formatRemaining(p: WatchProgress): string {
  const mins = Math.max(1, Math.round((p.duration - p.position) / 60))
  return `${mins} min left`
}

function Rail({ title, items }: { title: string; items: RailItem[] }): ReactElement | null {
  if (items.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">{title}</h2>
      <ul className={MOVIE_RAIL_CLASS}>
        {items.map(({ movie, progress }) => (
          <li key={movie.id} className={MOVIE_RAIL_ITEM_CLASS}>
            <MovieCard
              size="sm"
              href={`/movie/${movie.id}`}
              linkState={{ from: 'home' }}
              title={movie.title}
              posterUrl={movie.posterUrl}
              releaseYear={releaseYearFromDate(movie.releaseDate)}
              runtime={movie.runtime}
              genres={movie.genres}
              voteAverage={movie.voteAverage}
              progress={
                progress && progress.duration > 0 ? progress.position / progress.duration : null
              }
              note={progress ? formatRemaining(progress) : null}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "My list" rail, built from the local watchlist. Continue watching has its own screen. */
export function PersonalRails(): ReactElement | null {
  const [listItems, setListItems] = useState<RailItem[]>([])

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const [history, watchlist] = await Promise.all([
        window.api.history.list(),
        window.api.watchlist.get()
      ])
      const listIds = watchlist.filter((id) => !isEpisodeMediaKey(id)).slice(0, RAIL_MAX)
      const movies = await loadMovies(listIds)
      if (cancelled) return
      const byId = new Map(history.map((p) => [p.movieId, p]))
      setListItems(
        listIds.flatMap((id) => {
          const movie = movies.get(id)
          const p = byId.get(id) ?? null
          return movie ? [{ movie, progress: resumePosition(p) > 0 ? p : null }] : []
        })
      )
    })()
    return (): void => {
      cancelled = true
    }
  }, [])

  if (listItems.length === 0) return null
  return <Rail title="My list" items={listItems} />
}
