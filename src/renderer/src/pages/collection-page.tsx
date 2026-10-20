import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { DiscoverCollection, DiscoverMovieItem } from '@shared/discovery'
import { ChevronLeft } from 'lucide-react'
import { LearnChevron } from '@/components/interaction-motion'
import { Button } from '@/components/ui/button'
import { MovieGrid, PosterGridPlaceholder } from '@/components/movie-grid'
import { PageTurn } from '@/components/page-turn'
import { CATALOG_LIST_PAGE_SIZE } from '@/lib/catalog-list-page-size'

function parseListPage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function CollectionPage(): ReactElement {
  const { collectionId } = useParams<{ collectionId: string }>()
  const id = collectionId != null ? Number.parseInt(collectionId, 10) : Number.NaN
  const invalidId = !Number.isInteger(id) || id < 1

  const [searchParams, setSearchParams] = useSearchParams()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [collection, setCollection] = useState<DiscoverCollection | null>(null)
  const [movies, setMovies] = useState<DiscoverMovieItem[]>([])
  const [loading, setLoading] = useState(!invalidId)
  const [error, setError] = useState<string | null>(invalidId ? 'Invalid collection.' : null)
  const requestedPage = parseListPage(searchParams.get('page'))
  const totalPages = Math.max(1, Math.ceil(movies.length / CATALOG_LIST_PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)
  const pagedMovies = useMemo(() => {
    const start = (currentPage - 1) * CATALOG_LIST_PAGE_SIZE
    return movies.slice(start, start + CATALOG_LIST_PAGE_SIZE)
  }, [movies, currentPage])
  const rangeStart = movies.length === 0 ? 0 : (currentPage - 1) * CATALOG_LIST_PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * CATALOG_LIST_PAGE_SIZE, movies.length)

  const setListPage = (page: number): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (page <= 1) next.delete('page')
        else next.set('page', String(page))
        return next
      },
      { replace: true }
    )
  }

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
            <h1 ref={headingRef} className="type-display scroll-mt-4">
              {collection.name}
            </h1>
            <p className="type-meta text-muted-foreground">
              {collection.movieCount} {collection.movieCount === 1 ? 'movie' : 'movies'}
            </p>
            {collection.overview ? (
              <p className="type-prose text-muted-foreground">{collection.overview}</p>
            ) : null}
          </div>
        ) : null}
        {loading && movies.length === 0 && !error && <PosterGridPlaceholder />}
        {error && (
          <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
            {error}
          </p>
        )}
        {!loading && !error && movies.length === 0 && (
          <p className="text-muted-foreground text-sm">No movies found in this collection.</p>
        )}
        {movies.length > 0 && (
          <>
            <PageTurn page={currentPage} items={pagedMovies} scrollTarget={headingRef}>
              <MovieGrid items={pagedMovies} />
            </PageTurn>
            {totalPages > 1 && (
              <div className="flex flex-col items-center justify-center gap-3 pt-8 sm:flex-row sm:gap-6">
                <p className="text-muted-foreground order-2 text-sm sm:order-1">
                  Showing {rangeStart}–{rangeEnd} of {movies.length}
                </p>
                <div className="flex items-center gap-2 sm:order-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setListPage(currentPage - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft aria-hidden className="size-4" />
                    Previous
                  </Button>
                  <span className="text-muted-foreground min-w-[7rem] text-center text-sm tabular-nums">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="t-learn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setListPage(currentPage + 1)}
                    aria-label="Next page"
                  >
                    Next
                    <LearnChevron />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
