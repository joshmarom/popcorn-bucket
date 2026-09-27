import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogMovieDetails } from '@shared/catalog'
import { episodeCode, isEpisodeMediaKey } from '@shared/tv'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'

type ContinueItem = {
  key: string
  href: string
  title: string
  detail: string | null
  posterUrl: string | null
  progress: WatchProgress
}

function formatRemaining(p: WatchProgress): string {
  const mins = Math.max(1, Math.round((p.duration - p.position) / 60))
  return `${mins} min left`
}

export function ContinuePage(): ReactElement {
  const [items, setItems] = useState<ContinueItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async (): Promise<void> => {
      const [history, downloads] = await Promise.all([
        window.api.history.list(),
        window.api.torrent.getAllMovieDownloads()
      ])
      const resumable = history.filter((p) => resumePosition(p) > 0)
      const movieIds = resumable.filter((p) => !isEpisodeMediaKey(p.movieId)).map((p) => p.movieId)
      const movies = new Map<number, CatalogMovieDetails>()
      const loaded = await Promise.all(movieIds.map((id) => window.api.catalog.getMovie(id)))
      loaded.forEach((res, i) => {
        if (res.ok) movies.set(movieIds[i]!, res.movie)
      })
      if (cancelled) return

      const next: ContinueItem[] = []
      for (const progress of resumable) {
        if (isEpisodeMediaKey(progress.movieId)) {
          const episode = downloads.find((d) => d.movieId === progress.movieId)?.episode
          if (!episode) continue
          next.push({
            key: `ep-${progress.movieId}`,
            href: `/tv/${episode.showId}`,
            title: episode.showName,
            detail: `${episodeCode(episode.seasonNumber, episode.episodeNumber)} · ${formatRemaining(progress)}`,
            posterUrl: null,
            progress
          })
          continue
        }
        const movie = movies.get(progress.movieId)
        if (!movie) continue
        next.push({
          key: `m-${movie.id}`,
          href: `/movie/${movie.id}`,
          title: movie.title,
          detail: formatRemaining(progress),
          posterUrl: movie.posterUrl,
          progress
        })
      }
      setItems(next)
    })()
    return (): void => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Continue watching</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Movies and episodes you started and haven&apos;t finished.
        </p>
      </div>

      {items == null && <p className="text-muted-foreground text-sm">Loading…</p>}
      {items != null && items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing in progress. Start a movie or episode and it will show up here.
        </p>
      )}
      {items != null && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <li key={item.key}>
              <Link to={item.href} className="block text-left">
                <Card className="overflow-hidden pt-0 transition-shadow hover:shadow-md">
                  <div className="bg-muted relative aspect-[2/3] w-full overflow-hidden">
                    {item.posterUrl ? (
                      <img className="size-full object-cover" src={item.posterUrl} alt="" />
                    ) : (
                      <div className="text-muted-foreground flex size-full items-center justify-center px-2 text-center text-xs">
                        {item.title}
                      </div>
                    )}
                    {item.progress.duration > 0 ? (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                        <div
                          className="bg-primary h-full"
                          style={{
                            width: `${Math.min(100, (item.progress.position / item.progress.duration) * 100)}%`
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <CardFooter className="flex flex-col items-start gap-0.5 px-3 py-2">
                    <CardTitle className="line-clamp-2 text-sm leading-tight">
                      {item.title}
                    </CardTitle>
                    {item.detail ? (
                      <span className="text-muted-foreground text-xs">{item.detail}</span>
                    ) : null}
                  </CardFooter>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
