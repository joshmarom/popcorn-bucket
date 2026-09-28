import { type ReactElement } from 'react'
import type { CatalogMovieListItem } from '@shared/catalog'
import { MovieCard } from '@/components/movie-card'
import { useMovieListFacts } from '@/components/use-movie-list-facts'
import { MOVIE_GRID_CLASS } from '@/lib/movie-layout'

export function MovieGrid({ items }: { items: CatalogMovieListItem[] }): ReactElement {
  const movies = useMovieListFacts(items)
  return (
    <ul className={MOVIE_GRID_CLASS}>
      {movies.map((m) => (
        <li key={m.id}>
          <MovieCard
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
