import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { CatalogMovieListItem } from '@shared/catalog'
import { ListPager } from '@/components/list-pager'
import { SectionBackLink } from '@/components/section-back-link'
import { MovieGrid, PosterGridPlaceholder } from '@/components/movie-grid'
import { PageTurn } from '@/components/page-turn'
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

  const headingRef = useRef<HTMLHeadingElement>(null)
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
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 pb-16">
      <div className="space-y-2">
        <SectionBackLink section="movies" />
        <h1 ref={headingRef} className="type-page scroll-mt-4">
          {heading}
        </h1>
        <p className="text-muted-foreground text-sm">
          Ranked by torrent availability, TMDB popularity, and rating.
        </p>
      </div>

      {loading && items.length === 0 && !error && <PosterGridPlaceholder />}
      {error && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-muted-foreground text-sm">No movies found for this genre.</p>
      )}
      {items.length > 0 && (
        <>
          <PageTurn page={currentPage} items={pagedItems} scrollTarget={headingRef}>
            <MovieGrid items={pagedItems} />
          </PageTurn>
          <ListPager
            page={currentPage}
            itemCount={pagedItems.length}
            hasNext={currentPage < totalPages}
            totalPages={totalPages}
            total={items.length}
            onPageChange={setListPage}
          />
        </>
      )}
    </div>
  )
}
