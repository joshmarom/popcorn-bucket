import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { shouldIncludeCatalogListItem, type CatalogMovieListItem } from '@shared/catalog'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, RefreshCw } from 'lucide-react'
import { IconSwap } from '@/components/interaction-motion'
import { Button } from '@/components/ui/button'
import { MovieGrid, PosterGridPlaceholder } from '@/components/movie-grid'
import { DiscoveryRails } from '@/components/discovery-rails'
import { MovieGenreRails } from '@/components/movie-genre-rails'
import { BrowseHeader } from '@/components/browse-header'
import { ListPager } from '@/components/list-pager'
import { CATALOG_LIST_PAGE_SIZE } from '@/lib/catalog-list-page-size'
import { cn } from '@/lib/utils'
import { PageTurn } from '@/components/page-turn'

type TrendingPage = { page: number; results: CatalogMovieListItem[]; hasMore: boolean }

const SEARCH_SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance (TMDB)' },
  { value: 'release_date', label: 'Release date' },
  { value: 'rating', label: 'Rating' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'title', label: 'Title' }
] as const

type SearchSortValue = (typeof SEARCH_SORT_OPTIONS)[number]['value']

type SortOrder = 'asc' | 'desc'

function parseSearchSort(raw: string | null): SearchSortValue {
  const allowed = new Set<string>(SEARCH_SORT_OPTIONS.map((o) => o.value))
  if (raw && allowed.has(raw)) return raw as SearchSortValue
  return 'relevance'
}

function defaultOrderForSort(key: SearchSortValue): SortOrder {
  if (key === 'title') return 'asc'
  return 'desc'
}

function parseSortOrder(raw: string | null, key: SearchSortValue): SortOrder {
  if (key === 'relevance') return 'desc'
  if (raw === 'asc' || raw === 'desc') return raw
  return defaultOrderForSort(key)
}

function releaseSortMillis(m: CatalogMovieListItem): number | null {
  if (m.releaseDate) {
    const t = Date.parse(m.releaseDate)
    if (Number.isFinite(t)) return t
  }
  if (m.releaseYear != null) return Date.UTC(m.releaseYear, 6, 1)
  return null
}

/** Null / unknown last; direction flips the primary comparison for non-null pairs. */
function compareNullableWithDirection(
  a: number | null,
  b: number | null,
  order: SortOrder
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const asc = a < b ? -1 : a > b ? 1 : 0
  return order === 'asc' ? asc : -asc
}

function sortSearchResults(
  items: CatalogMovieListItem[],
  key: SearchSortValue,
  order: SortOrder
): CatalogMovieListItem[] {
  if (key === 'relevance') return items
  const copy = [...items]
  const byTitle = (a: CatalogMovieListItem, b: CatalogMovieListItem): number =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  const stableTitleTie = (a: CatalogMovieListItem, b: CatalogMovieListItem): number => byTitle(a, b)
  switch (key) {
    case 'release_date':
      return copy.sort((a, b) => {
        const c = compareNullableWithDirection(releaseSortMillis(a), releaseSortMillis(b), order)
        return c !== 0 ? c : stableTitleTie(a, b)
      })
    case 'rating':
      return copy.sort((a, b) => {
        const c = compareNullableWithDirection(a.voteAverage, b.voteAverage, order)
        return c !== 0 ? c : stableTitleTie(a, b)
      })
    case 'popularity':
      return copy.sort((a, b) => {
        const c = compareNullableWithDirection(a.popularity, b.popularity, order)
        return c !== 0 ? c : stableTitleTie(a, b)
      })
    case 'title':
      return copy.sort((a, b) => {
        const t = byTitle(a, b)
        return order === 'asc' ? t : -t
      })
    default:
      return copy
  }
}

function parseListPage(raw: string | null): number {
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

export function HomePage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const sortKey = parseSearchSort(searchParams.get('sort'))
  const sortOrder = parseSortOrder(searchParams.get('order'), sortKey)
  const debouncedQuery = useDebouncedValue(query, 400)

  const setQuery = (q: string): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (q.trim()) {
          next.set('q', q)
        } else {
          next.delete('q')
          next.delete('sort')
          next.delete('order')
          next.delete('page')
        }
        return next
      },
      { replace: true }
    )
  }

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

  const setSearchSort = (key: SearchSortValue): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('order')
        next.delete('page')
        if (key === 'relevance') {
          next.delete('sort')
        } else {
          next.set('sort', key)
        }
        return next
      },
      { replace: true }
    )
  }

  const toggleSortOrder = (): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const key = parseSearchSort(next.get('sort'))
        const current = parseSortOrder(next.get('order'), key)
        next.set('order', current === 'asc' ? 'desc' : 'asc')
        return next
      },
      { replace: true }
    )
  }

  const [trending, setTrending] = useState<TrendingPage | null>(null)
  const [trendingError, setTrendingError] = useState<string | null>(null)
  const [trendingLoading, setTrendingLoading] = useState(true)
  const listHeadingRef = useRef<HTMLDivElement>(null)

  const [searchResults, setSearchResults] = useState<CatalogMovieListItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [trendingRefreshBusy, setTrendingRefreshBusy] = useState(false)

  const showingSearch = debouncedQuery.trim().length >= 2

  const requestedPage = parseListPage(searchParams.get('page'))

  const refreshTrendingList = async (): Promise<void> => {
    setTrendingRefreshBusy(true)
    setTrendingError(null)
    const res = await window.api.catalog.trendingPage({ page: 1, forceRefresh: true })
    if (res.ok) {
      setTrending({ page: 1, results: res.results, hasMore: res.hasMore })
    } else {
      setTrending(null)
      setTrendingError(res.error)
    }
    setTrendingRefreshBusy(false)
    if (requestedPage !== 1) setListPage(1)
  }

  const catalogListKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const key = `${showingSearch ? 's' : 'n'}:${debouncedQuery.trim()}`
    if (catalogListKeyRef.current === null) {
      catalogListKeyRef.current = key
      return
    }
    if (catalogListKeyRef.current !== key) {
      catalogListKeyRef.current = key
      setSearchParams(
        (prev) => {
          if (!prev.get('page')) return prev
          const next = new URLSearchParams(prev)
          next.delete('page')
          return next
        },
        { replace: true }
      )
    }
  }, [debouncedQuery, showingSearch, setSearchParams])

  useEffect(() => {
    if (!showingSearch) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    let cancelled = false
    setSearchLoading(true)
    setSearchError(null)
    void window.api.catalog.search(debouncedQuery.trim()).then((res) => {
      if (cancelled) return
      setSearchLoading(false)
      if (res.ok) {
        setSearchResults(res.results.filter(shouldIncludeCatalogListItem))
      } else {
        setSearchResults([])
        setSearchError(res.error)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [debouncedQuery, showingSearch])

  // Trending is paged by the main process, which keeps discovering titles as pages go deeper.
  useEffect(() => {
    if (showingSearch) return
    let cancelled = false
    setTrendingLoading(true)
    setTrendingError(null)
    void window.api.catalog.trendingPage({ page: requestedPage }).then((res) => {
      if (cancelled) return
      setTrendingLoading(false)
      if (!res.ok) {
        setTrending(null)
        setTrendingError(res.error)
        return
      }
      const results = res.results.filter(shouldIncludeCatalogListItem)
      if (results.length === 0 && res.page > 1) {
        // Past the end (e.g. an old link): go back to the first page.
        setListPage(1)
        return
      }
      setTrending({ page: res.page, results, hasMore: res.hasMore })
    })
    return (): void => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingSearch, requestedPage])

  const searchPending = query.trim().length >= 2 && debouncedQuery !== query
  const listLoading = showingSearch ? searchLoading || searchPending : trendingLoading

  const sortedSearchResults = useMemo(
    () => sortSearchResults(searchResults, sortKey, sortOrder),
    [searchResults, sortKey, sortOrder]
  )

  // Search results are one finite list paged here; Trending arrives one page at a time.
  const searchTotalPages = Math.max(
    1,
    Math.ceil(sortedSearchResults.length / CATALOG_LIST_PAGE_SIZE)
  )
  const searchPage = Math.min(requestedPage, searchTotalPages)

  useEffect(() => {
    if (!showingSearch || sortedSearchResults.length === 0) return
    if (requestedPage <= searchTotalPages) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (searchTotalPages <= 1) {
          next.delete('page')
        } else {
          next.set('page', String(searchTotalPages))
        }
        return next
      },
      { replace: true }
    )
  }, [showingSearch, sortedSearchResults.length, requestedPage, searchTotalPages, setSearchParams])

  const list = useMemo(() => {
    if (showingSearch) {
      const start = (searchPage - 1) * CATALOG_LIST_PAGE_SIZE
      return {
        heading: 'Search results',
        error: searchError,
        items: sortedSearchResults.slice(start, start + CATALOG_LIST_PAGE_SIZE),
        page: searchPage,
        hasNext: searchPage < searchTotalPages,
        totalPages: searchTotalPages as number | null,
        total: sortedSearchResults.length as number | null
      }
    }
    return {
      heading: 'Trending',
      error: trendingError,
      items: trending?.results ?? [],
      page: trending?.page ?? requestedPage,
      hasNext: trending?.hasMore ?? false,
      totalPages: null as number | null,
      total: null as number | null
    }
  }, [
    showingSearch,
    searchPage,
    searchError,
    sortedSearchResults,
    searchTotalPages,
    trending,
    trendingError,
    requestedPage
  ])

  return (
    <div className="pb-8">
      <BrowseHeader section="movies" query={query} onQueryChange={setQuery} loading={listLoading} />

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-8">
        <div
          ref={listHeadingRef}
          className="flex min-h-9 scroll-mt-24 flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-kicker">{list.heading}</h2>
            {!showingSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={trendingLoading || trendingRefreshBusy}
                title="Rebuild the trending list from TorrentClaw and torrent indexers (ignores the 24h cache)"
                onClick={() => void refreshTrendingList()}
              >
                <RefreshCw
                  className={cn(
                    'size-3.5',
                    (trendingLoading || trendingRefreshBusy) && 'animate-spin'
                  )}
                />
                Refresh
              </Button>
            )}
          </div>
          {showingSearch && debouncedQuery.trim().length >= 2 && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="search-sort"
                className="text-muted-foreground text-sm whitespace-nowrap"
              >
                Sort by
              </label>
              <div className="flex items-center gap-1">
                <select
                  id="search-sort"
                  value={sortKey}
                  onChange={(e) => setSearchSort(parseSearchSort(e.target.value))}
                  className={cn(
                    'border-input bg-background h-9 min-w-[11rem] rounded-md border px-3 py-1 text-sm shadow-xs',
                    'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
                  )}
                >
                  {SEARCH_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  disabled={sortKey === 'relevance'}
                  onClick={() => toggleSortOrder()}
                  title={
                    sortKey === 'relevance'
                      ? 'Not available for relevance order'
                      : sortOrder === 'asc'
                        ? 'Ascending — click for descending'
                        : 'Descending — click for ascending'
                  }
                  aria-label={sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
                >
                  <IconSwap
                    state={sortOrder === 'asc' ? 'a' : 'b'}
                    a={<ArrowUpNarrowWide aria-hidden />}
                    b={<ArrowDownWideNarrow aria-hidden />}
                  />
                </Button>
              </div>
            </div>
          )}
        </div>
        {list.error && (
          <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
            {list.error}
          </p>
        )}
        {!listLoading && !list.error && list.items.length === 0 && showingSearch && (
          <p className="text-muted-foreground text-sm">No movies match that search.</p>
        )}
        {listLoading && list.items.length === 0 && !list.error && <PosterGridPlaceholder />}
        {list.items.length > 0 && (
          <>
            <PageTurn page={list.page} items={list.items} scrollTarget={listHeadingRef}>
              <MovieGrid items={list.items} />
            </PageTurn>
            <ListPager
              page={list.page}
              itemCount={list.items.length}
              hasNext={list.hasNext}
              totalPages={list.totalPages}
              total={list.total}
              disabled={listLoading}
              onPageChange={setListPage}
            />
          </>
        )}
        {!showingSearch && <DiscoveryRails />}
        {!showingSearch && <MovieGenreRails />}
      </div>
    </div>
  )
}
