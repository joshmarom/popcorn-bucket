import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { CardScopeContext } from '@/lib/screen-transition'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import type { CatalogGenreRail } from '@shared/catalog'
import { LearnChevron } from '@/components/interaction-motion'
import { MovieCard } from '@/components/movie-card'
import { useMovieListFacts } from '@/components/use-movie-list-facts'
import { VirtualRails } from '@/components/virtual-rails'
import { Button } from '@/components/ui/button'
import { MOVIE_RAIL_CLASS, MOVIE_RAIL_ITEM_CLASS } from '@/lib/movie-layout'
import { cn } from '@/lib/utils'

function GenreRailRow({ rail }: { rail: CatalogGenreRail }): ReactElement {
  const movies = useMovieListFacts(rail.movies)
  const nameQ = encodeURIComponent(rail.genre.name)
  return (
    <CardScopeContext.Provider value={`genre-rail-${rail.genre.id}`}>
      <section className="space-y-4" aria-labelledby={`genre-rail-${rail.genre.id}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 pe-1">
          <h3 id={`genre-rail-${rail.genre.id}`} className="type-kicker">
            {rail.genre.name}
          </h3>
          <Button
            variant="link"
            className="t-learn text-muted-foreground hover:text-foreground h-auto p-0 text-sm"
            asChild
          >
            <Link to={`/genre/${rail.genre.id}?name=${nameQ}`}>
              All in {rail.genre.name}
              <LearnChevron />
            </Link>
          </Button>
        </div>
        <ul className={MOVIE_RAIL_CLASS}>
          {movies.map((m, index) => (
            <li key={m.id} className={MOVIE_RAIL_ITEM_CLASS}>
              <MovieCard
                size="sm"
                index={index}
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
      </section>
    </CardScopeContext.Provider>
  )
}

/** "Browse by genre" for movies: one rail per genre, each linking to its full page. */
export function MovieGenreRails(): ReactElement {
  const [rails, setRails] = useState<CatalogGenreRail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const res = await window.api.catalog.genreRails()
    setLoading(false)
    if (res.ok) {
      setRails(res.rails)
    } else {
      setRails([])
      setError(res.error)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.api.catalog.genreRails().then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setRails(res.rails)
      else setError(res.error)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  return (
    <div className="border-border space-y-12 border-t pt-12">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-kicker">Browse by genre</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={loading}
          title="Reload genre rails from TMDB"
          onClick={() => void load()}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>
      {loading && rails.length === 0 && (
        <p className="text-muted-foreground text-sm">Loading genre rows…</p>
      )}
      {error && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <VirtualRails
        items={rails}
        getKey={(rail) => rail.genre.id}
        renderItem={(rail) => <GenreRailRow rail={rail} />}
      />
    </div>
  )
}
