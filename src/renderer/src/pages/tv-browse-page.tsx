import { useEffect, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TvListPage, TvShowListItem } from '@shared/tv'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(500, Math.floor(n))
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return (): void => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function ShowGrid({ shows }: { shows: TvShowListItem[] }): ReactElement {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {shows.map((s) => (
        <li key={s.id}>
          <Link to={`/tv/${s.id}`} className="block text-left">
            <Card className="overflow-hidden pt-0 transition-shadow hover:shadow-md">
              <div className="bg-muted aspect-[2/3] w-full overflow-hidden">
                {s.posterUrl ? (
                  <img className="size-full object-cover" src={s.posterUrl} alt="" />
                ) : (
                  <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
                    No poster
                  </div>
                )}
              </div>
              <CardFooter className="flex flex-col items-start gap-1 px-3 py-2">
                <CardTitle className="line-clamp-2 text-sm leading-tight">{s.name}</CardTitle>
                {s.firstAirYear != null && (
                  <span className="text-muted-foreground text-xs">{s.firstAirYear}</span>
                )}
              </CardFooter>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ListPager({
  page,
  totalPages,
  totalResults,
  count,
  onPage
}: {
  page: TvListPage['page']
  totalPages: number
  totalResults: number
  count: number
  onPage: (page: number) => void
}): ReactElement | null {
  if (totalPages <= 1 || count === 0) return null
  const start = (page - 1) * 20 + 1
  const end = start + count - 1
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-8 sm:flex-row sm:gap-6">
      <p className="text-muted-foreground order-2 text-sm sm:order-1">
        Showing {start}–{end} of {totalResults}
      </p>
      <div className="flex items-center gap-2 sm:order-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Button>
        <span className="text-muted-foreground min-w-[7rem] text-center text-sm tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function TvBrowsePage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const page = parsePage(searchParams.get('page'))
  const debounced = useDebouncedValue(query, 300).trim()
  const searching = debounced.length >= 2

  const [list, setList] = useState<TvListPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setPage = (nextPage: number): void => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (nextPage <= 1) params.delete('page')
        else params.set('page', String(nextPage))
        return params
      },
      { replace: true }
    )
    document.querySelector('main')?.scrollTo({ top: 0 })
  }

  useEffect(() => {
    let cancelled = false
    setList(null)
    setError(null)
    const request = searching ? window.api.tv.search(debounced, page) : window.api.tv.popular(page)
    void request.then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      if (res.totalPages > 0 && page > res.totalPages) {
        setPage(res.totalPages)
        return
      }
      setList(res)
    })
    return (): void => {
      cancelled = true
    }
    // setPage closes over the latest search params; page and query are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, searching, page])

  return (
    <div className="pb-8">
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b border-border px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">TV shows</h1>
          <Input
            className="max-w-md"
            placeholder="Search TV shows…"
            value={query}
            onChange={(e) => {
              const next = e.target.value
              setSearchParams(
                (prev) => {
                  const params = new URLSearchParams(prev)
                  if (next) params.set('q', next)
                  else params.delete('q')
                  params.delete('page')
                  return params
                },
                { replace: true }
              )
            }}
          />
        </div>
        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="text-muted-foreground mx-auto mt-2 max-w-6xl text-sm">
            Type at least 2 characters to search.
          </p>
        )}
      </div>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          {searching ? 'Results' : 'Trending'}
        </h2>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {list == null && !error && (
          <p className="text-muted-foreground text-sm">{searching ? 'Searching…' : 'Loading…'}</p>
        )}
        {list != null && list.results.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {searching ? 'No shows match that search.' : 'No shows to show.'}
          </p>
        )}
        {list != null && list.results.length > 0 && (
          <>
            <ShowGrid shows={list.results} />
            <ListPager
              page={list.page}
              totalPages={list.totalPages}
              totalResults={list.totalResults}
              count={list.results.length}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}
