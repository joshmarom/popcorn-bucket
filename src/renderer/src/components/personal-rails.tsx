import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogMovieDetails } from '@shared/catalog'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { isEpisodeMediaKey } from '@shared/tv'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'

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
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {items.map(({ movie, progress }) => (
          <li key={movie.id} className="w-[118px] shrink-0 snap-start sm:w-[128px]">
            <Link to={`/movie/${movie.id}`} className="block text-left" state={{ from: 'home' }}>
              <Card className="overflow-hidden pt-0 transition-shadow hover:shadow-md">
                <div className="bg-muted relative aspect-[2/3] w-full overflow-hidden">
                  {movie.posterUrl ? (
                    <img className="size-full object-cover" src={movie.posterUrl} alt="" />
                  ) : (
                    <div className="text-muted-foreground flex size-full items-center justify-center text-[10px]">
                      No poster
                    </div>
                  )}
                  {progress && progress.duration > 0 ? (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                      <div
                        className="bg-primary h-full"
                        style={{
                          width: `${Math.min(100, (progress.position / progress.duration) * 100)}%`
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                <CardFooter className="flex flex-col items-start gap-0.5 px-2 py-1.5">
                  <CardTitle className="line-clamp-2 text-xs leading-tight">
                    {movie.title}
                  </CardTitle>
                  {progress ? (
                    <span className="text-muted-foreground text-[10px]">
                      {formatRemaining(progress)}
                    </span>
                  ) : null}
                </CardFooter>
              </Card>
            </Link>
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
