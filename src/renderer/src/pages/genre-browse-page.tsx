import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { CatalogMovieListItem } from '@shared/catalog'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MovieGrid } from '@/components/movie-grid'
import { CATALOG_LIST_PAGE_SIZE } from '@/lib/catalog-list-page-size'

function parseListPage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function GenreBrowsePage(): ReactElement {
  const { genreId: genreIdParam } = useParams<{ genreId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const nameFromQuery = searchParams.get('name')?.trim() ?? ''

  const genreId = genreIdParam != null ? Number.parseInt(genreIdParam, 10) : Number.NaN
  const invalidId = !Number.isFinite(genreId) || genreId < 1

  const [items, setItems] = useState<CatalogMovieListItem[]>([])
  const [loading, setLoading] = useState(!invalidId)
  const [error, setError] = useState<string | null>(invalidId ? 'Invalid genre.' : null)

  const requestedPage = parseListPage(searchParams.get('page'))
  const totalPages = Math.max(1, Math.ceil(items.length / CATALOG_LIST_PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)

  useEffect(() => {
    if (invalidId) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setItems([])
    void window.api.catalog.discoverGenre(genreId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) {
        setItems(res.results)
      } else {
        setError(res.error)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [genreId, invalidId])

  useEffect(() => {
    if (items.length === 0) return
    if (requestedPage <= totalPages) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (totalPages <= 1) {
          next.delete('page')
        } else {
          next.set('page', String(totalPages))
        }
        return next
      },
      { replace: true }
    )
  }, [items.length, requestedPage, totalPages, setSearchParams])

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * CATALOG_LIST_PAGE_SIZE
    return items.slice(start, start + CATALOG_LIST_PAGE_SIZE)
  }, [items, currentPage])

  const rangeStart = items.length === 0 ? 0 : (currentPage - 1) * CATALOG_LIST_PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * CATALOG_LIST_PAGE_SIZE, items.length)

  const heading = nameFromQuery || `Genre #${genreId}`

  const setListPage = (page: number): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (page <= 1) {
          next.delete('page')
        } else {
          next.set('page', String(page))
        }
        return next
      },
      { replace: true }
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" type="button" asChild>
          <Link to="/">Back</Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-muted-foreground text-sm">
        Ranked by torrent availability, TMDB popularity, and rating.
      </p>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-muted-foreground text-sm">No titles found for this genre.</p>
      )}
      {items.length > 0 && (
        <>
          <MovieGrid items={pagedItems} />
          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-center gap-3 pt-8 sm:flex-row sm:gap-6">
              <p className="text-muted-foreground order-2 text-sm sm:order-1">
                Showing {rangeStart}–{rangeEnd} of {items.length}
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
                  disabled={currentPage >= totalPages}
                  onClick={() => setListPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
