import { type ReactElement } from 'react'
import type { CatalogMovieListItem } from '@shared/catalog'
import { MovieCard } from '@/components/movie-card'
import { useMovieListFacts } from '@/components/use-movie-list-facts'
import { MOVIE_GRID_CLASS } from '@/lib/movie-layout'

export function PosterGridPlaceholder({ count = 12 }: { count?: number }): ReactElement {
  return (
    <ul className={MOVIE_GRID_CLASS} aria-busy="true" aria-label="Loading titles">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="t-skel-bar bg-muted aspect-[2/3] rounded-lg" />
          <div className="mt-2 space-y-2">
            <div className="t-skel-bar bg-muted h-4 w-4/5 rounded-md" />
            <div className="t-skel-bar bg-muted h-3 w-1/2 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function MovieGrid({ items }: { items: CatalogMovieListItem[] }): ReactElement {
  const movies = useMovieListFacts(items)
  return (
    <ul className={MOVIE_GRID_CLASS}>
      {movies.map((m, index) => (
        <li key={m.id}>
          <MovieCard
            index={index}
            eager
            href={`/movie/${m.id}`}
            linkState={{ from: 'home' }}
            title={m.title}
            posterUrl={m.posterUrl}
            releaseYear={m.releaseYear}
            runtime={m.runtime}
            genres={m.genres}
            voteAverage={m.voteAverage}
          />
        </li>
      ))}
    </ul>
  )
}
