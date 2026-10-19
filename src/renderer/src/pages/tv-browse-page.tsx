import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { TvShowListItem } from '@shared/tv'
import { hasListPosterUrl, hasMeaningfulListOverview } from '@shared/catalog'
import { Button } from '@/components/ui/button'
import { SearchAutocomplete } from '@/components/search-autocomplete'
import { ShowGrid } from '@/components/show-grid'
import { TvDiscoveryRails } from '@/components/tv-discovery-rails'
import { TvGenreRails } from '@/components/tv-genre-rails'
import { useScrollToOnPageChange } from '@/hooks/use-scroll-to-on-page-change'
import { CATALOG_LIST_PAGE_SIZE } from '@/lib/catalog-list-page-size'
import { cn } from '@/lib/utils'

type TrendingPage = { page: number; results: TvShowListItem[]; hasMore: boolean }

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return (): void => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function shouldIncludeShow(show: TvShowListItem): boolean {
  return hasListPosterUrl(show.posterUrl) || hasMeaningfulListOverview(show.overview)
}

export function TvBrowsePage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const requestedPage = parsePage(searchParams.get('page'))
  const debounced = useDebouncedValue(query, 300).trim()
  const searching = debounced.length >= 2
  const headingRef = useRef<HTMLDivElement>(null)

  const [trending, setTrending] = useState<TrendingPage | null>(null)
  const [trendingError, setTrendingError] = useState<string | null>(null)
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [refreshBusy, setRefreshBusy] = useState(false)

  const [searchResults, setSearchResults] = useState<TvShowListItem[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

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
  }

  const setQuery = (next: string): void => {
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
  }

  // Search: every TMDB result at once, paged here.
  useEffect(() => {
    if (!searching) {
      setSearchResults(null)
      setSearchError(null)
      return
    }
    let cancelled = false
    setSearchResults(null)
    setSearchError(null)
    void window.api.tv.searchAll(debounced).then((res) => {
      if (cancelled) return
      if (res.ok) setSearchResults(res.results.filter(shouldIncludeShow))
      else setSearchError(res.error)
    })
    return (): void => {
      cancelled = true
    }
  }, [debounced, searching])

  // Trending: paged by the main process, which keeps finding shows as pages go deeper.
  useEffect(() => {
    if (searching) return
    let cancelled = false
    setTrendingLoading(true)
    setTrendingError(null)
    void window.api.tv.trendingPage({ page: requestedPage }).then((res) => {
      if (cancelled) return
      setTrendingLoading(false)
      if (!res.ok) {
        setTrending(null)
        setTrendingError(res.error)
        return
      }
      const results = res.results.filter(shouldIncludeShow)
      if (results.length === 0 && res.page > 1) {
        // Past the end (e.g. an old link): go back to the first page.
        setPage(1)
        return
      }
      setTrending({ page: res.page, results, hasMore: res.hasMore })
    })
    return (): void => {
      cancelled = true
    }
    // setPage closes over the latest search params; page and mode are the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, requestedPage])

  const refreshTrending = async (): Promise<void> => {
    setRefreshBusy(true)
    setTrendingError(null)
    const res = await window.api.tv.trendingPage({ page: 1, forceRefresh: true })
    if (res.ok) {
      setTrending({ page: 1, results: res.results.filter(shouldIncludeShow), hasMore: res.hasMore })
    } else {
      setTrending(null)
      setTrendingError(res.error)
    }
    setRefreshBusy(false)
    if (requestedPage !== 1) setPage(1)
  }

  const searchTotalPages = Math.max(
    1,
    Math.ceil((searchResults?.length ?? 0) / CATALOG_LIST_PAGE_SIZE)
  )
  const searchPage = Math.min(requestedPage, searchTotalPages)

  const list = useMemo(() => {
    if (searching) {
      const start = (searchPage - 1) * CATALOG_LIST_PAGE_SIZE
      return {
        loading: searchResults == null && !searchError,
        error: searchError,
        items: (searchResults ?? []).slice(start, start + CATALOG_LIST_PAGE_SIZE),
        page: searchPage,
        hasNext: searchPage < searchTotalPages,
        pageLabel: `Page ${searchPage} of ${searchTotalPages}`,
        total: searchResults?.length ?? null
      }
    }
    const page = trending?.page ?? requestedPage
    return {
      loading: trendingLoading,
      error: trendingError,
      items: trending?.results ?? [],
      page,
      hasNext: trending?.hasMore ?? false,
      pageLabel: `Page ${page}`,
      total: null as number | null
    }
  }, [
    searching,
    searchPage,
    searchResults,
    searchError,
    searchTotalPages,
    trending,
    trendingLoading,
    trendingError,
    requestedPage
  ])

  // Keyed on the page actually rendered, so the scroll happens once the new cards are in place.
  useScrollToOnPageChange(headingRef, list.page)

  const rangeStart = list.items.length === 0 ? 0 : (list.page - 1) * CATALOG_LIST_PAGE_SIZE + 1
  const rangeEnd = rangeStart === 0 ? 0 : rangeStart + list.items.length - 1
  const hasPrev = list.page > 1

  return (
    <div className="pb-8">
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b border-border px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <h1 className="type-page">TV shows</h1>
          <SearchAutocomplete
            className="w-full max-w-md"
            placeholder="Search TV shows…"
            value={query}
            onChange={setQuery}
          />
          {list.loading && <span className="text-muted-foreground text-sm">Loading…</span>}
        </div>
        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="text-muted-foreground mx-auto mt-2 max-w-6xl text-sm">
            Type at least 2 characters to search.
          </p>
        )}
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-8">
        <div ref={headingRef} className="flex scroll-mt-24 flex-wrap items-center gap-2">
          <h2 className="type-kicker">{searching ? 'Results' : 'Trending'}</h2>
          {!searching && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={trendingLoading || refreshBusy}
              title="Rebuild the trending list from TorrentClaw and torrent indexers (ignores the 24h cache)"
              onClick={() => void refreshTrending()}
            >
              <RefreshCw
                className={cn('size-3.5', (trendingLoading || refreshBusy) && 'animate-spin')}
              />
              Refresh
            </Button>
          )}
        </div>
        {list.error && <p className="text-destructive text-sm">{list.error}</p>}
        {!list.loading && !list.error && list.items.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {searching ? 'No shows match that search.' : 'No shows to show.'}
          </p>
        )}
        {list.items.length > 0 && (
          <>
            <ShowGrid shows={list.items} />
            {(hasPrev || list.hasNext) && (
              <div className="flex flex-col items-center justify-center gap-3 pt-8 sm:flex-row sm:gap-6">
                <p className="text-muted-foreground order-2 text-sm sm:order-1">
                  Showing {rangeStart}–{rangeEnd}
                  {list.total != null ? ` of ${list.total}` : ''}
                </p>
                <div className="flex items-center gap-2 sm:order-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasPrev || list.loading}
                    onClick={() => setPage(list.page - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft aria-hidden className="size-4" />
                    Previous
                  </Button>
                  <span className="text-muted-foreground min-w-[7rem] text-center text-sm tabular-nums">
                    {list.pageLabel}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!list.hasNext || list.loading}
                    onClick={() => setPage(list.page + 1)}
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
        {!searching && <TvDiscoveryRails className="mt-12" />}
        {!searching && <TvGenreRails />}
      </div>
    </div>
  )
}
