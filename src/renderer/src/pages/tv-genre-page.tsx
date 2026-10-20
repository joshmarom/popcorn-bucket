import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { TvShowListItem } from '@shared/tv'
import { ListPager } from '@/components/list-pager'
import { SectionBackLink } from '@/components/section-back-link'
import { PosterGridPlaceholder } from '@/components/movie-grid'
import { ShowGrid } from '@/components/show-grid'
import { PageTurn } from '@/components/page-turn'

type GenrePage = { page: number; results: TvShowListItem[]; hasMore: boolean }

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

/** Every show in a TMDB TV genre, most popular first, 24 per page with no fixed end. */
export function TvGenrePage(): ReactElement {
  const { genreId: genreIdParam } = useParams<{ genreId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const genreId = genreIdParam != null ? Number.parseInt(genreIdParam, 10) : Number.NaN
  const invalidId = !Number.isInteger(genreId) || genreId < 1
  const requestedPage = parsePage(searchParams.get('page'))
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [name, setName] = useState(searchParams.get('name')?.trim() ?? '')
  const [data, setData] = useState<GenrePage | null>(null)
  const [loading, setLoading] = useState(!invalidId)
  const [error, setError] = useState<string | null>(invalidId ? 'Invalid genre.' : null)

  useEffect(() => {
    if (invalidId || name) return
    void window.api.tv.genres().then((genres) => {
      const match = genres.find((g) => g.id === genreId)
      if (match) setName(match.name)
    })
  }, [genreId, invalidId, name])

  const setPage = (page: number): void => {
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
    void window.api.tv.discoverGenre(genreId, requestedPage).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok) setData({ page: res.page, results: res.results, hasMore: res.hasMore })
      else setError(res.error)
    })
    return (): void => {
      cancelled = true
    }
  }, [genreId, invalidId, requestedPage])

  const page = data?.page ?? requestedPage
  const items = data?.results ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 pb-16">
      <div className="space-y-2">
        <SectionBackLink section="tv" />
        <h1 ref={headingRef} className="type-page scroll-mt-4">
          {name || 'TV genre'}
        </h1>
        <p className="text-muted-foreground text-sm">Most popular on TMDB first.</p>
      </div>

      {loading && items.length === 0 && !error && <PosterGridPlaceholder />}
      {error && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-muted-foreground text-sm">No shows found for this genre.</p>
      )}
      {items.length > 0 && (
        <>
          <PageTurn page={page} items={items} scrollTarget={headingRef}>
            <ShowGrid shows={items} />
          </PageTurn>
          <ListPager
            page={page}
            itemCount={items.length}
            hasNext={data?.hasMore ?? false}
            disabled={loading}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
