import { useEffect, useState, type ReactElement } from 'react'
import type { CatalogMovieDetails } from '@shared/catalog'
import { episodeCode, isEpisodeMediaKey } from '@shared/tv'
import { resumePosition, type WatchProgress } from '@shared/watch-history'
import { MovieCard } from '@/components/movie-card'
import { MOVIE_GRID_CLASS } from '@/lib/movie-layout'
import { releaseYearFromDate } from '@/lib/movie-meta'

type ContinueItem = {
  key: string
  href: string
  title: string
  detail: string | null
  posterUrl: string | null
  progress: WatchProgress
  releaseYear: number | null
  voteAverage: number | null
  runtime: number | null
  genres: string[]
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
            progress,
            releaseYear: null,
            voteAverage: null,
            runtime: null,
            genres: []
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
          progress,
          releaseYear: releaseYearFromDate(movie.releaseDate),
          voteAverage: movie.voteAverage,
          runtime: movie.runtime,
          genres: movie.genres
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
        <ul className={MOVIE_GRID_CLASS}>
          {items.map((item) => (
            <li key={item.key}>
              <MovieCard
                href={item.href}
                title={item.title}
                posterUrl={item.posterUrl}
                releaseYear={item.releaseYear}
                runtime={item.runtime}
                genres={item.genres}
                voteAverage={item.voteAverage}
                progress={
                  item.progress.duration > 0
                    ? item.progress.position / item.progress.duration
                    : null
                }
                note={item.detail}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
