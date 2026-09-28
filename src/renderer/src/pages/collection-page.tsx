import { useEffect, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { DiscoverCollection, DiscoverMovieItem } from '@shared/discovery'
import { Button } from '@/components/ui/button'
import { MovieGrid } from '@/components/movie-grid'

export function CollectionPage(): ReactElement {
  const { collectionId } = useParams<{ collectionId: string }>()
  const id = collectionId != null ? Number.parseInt(collectionId, 10) : Number.NaN
  const invalidId = !Number.isInteger(id) || id < 1

  const [collection, setCollection] = useState<DiscoverCollection | null>(null)
  const [movies, setMovies] = useState<DiscoverMovieItem[]>([])
  const [loading, setLoading] = useState(!invalidId)
  const [error, setError] = useState<string | null>(invalidId ? 'Invalid collection.' : null)

  useEffect(() => {
    if (invalidId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void window.api.discover.collection(id).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) {
        setCollection(res.collection)
        setMovies(res.movies)
      } else {
        setError(res.error)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [id, invalidId])

  return (
    <div className="pb-12">
      {collection?.backdropUrl ? (
        <div className="relative h-56 overflow-hidden sm:h-72">
          <img
            src={collection.backdropUrl}
            alt=""
            className="size-full object-cover opacity-60"
            decoding="async"
          />
          <div className="from-background absolute inset-0 bg-gradient-to-t to-transparent" />
        </div>
      ) : null}
      <div
        className={
          collection?.backdropUrl
            ? 'relative mx-auto -mt-24 max-w-6xl space-y-4 px-4'
            : 'mx-auto max-w-6xl space-y-4 px-4 pt-4'
        }
      >
        <Button variant="outline" size="sm" type="button" asChild>
          <Link to="/">Back</Link>
        </Button>
        {collection ? (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{collection.name}</h1>
            <p className="text-muted-foreground text-sm">
              {collection.movieCount} {collection.movieCount === 1 ? 'movie' : 'movies'}
            </p>
            {collection.overview ? (
              <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
                {collection.overview}
              </p>
            ) : null}
          </div>
        ) : null}
        {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {error && (
          <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
            {error}
          </p>
        )}
        {!loading && !error && movies.length === 0 && (
          <p className="text-muted-foreground text-sm">No movies found in this collection.</p>
        )}
        {movies.length > 0 && <MovieGrid items={movies} />}
      </div>
    </div>
  )
}
