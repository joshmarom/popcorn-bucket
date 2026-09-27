import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  shouldIncludeCatalogListItem,
  type CatalogGenreRail,
  type CatalogMovieListItem
} from '@shared/catalog'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MovieGrid } from '@/components/movie-grid'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CATALOG_LIST_PAGE_SIZE } from '@/lib/catalog-list-page-size'
import { cn } from '@/lib/utils'

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

function GenreRailRow({ rail }: { rail: CatalogGenreRail }): ReactElement {
  const nameQ = encodeURIComponent(rail.genre.name)
  return (
    <section className="space-y-2" aria-labelledby={`genre-rail-${rail.genre.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 pe-1">
        <h3
          id={`genre-rail-${rail.genre.id}`}
          className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
        >
          {rail.genre.name}
        </h3>
        <Button
          variant="link"
          className="text-muted-foreground hover:text-foreground h-auto p-0 text-sm"
          asChild
        >
          <Link to={`/genre/${rail.genre.id}?name=${nameQ}`}>
            All in {rail.genre.name}
            <ChevronRight aria-hidden className="ml-0.5 inline size-4 align-text-bottom" />
          </Link>
        </Button>
      </div>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
        {rail.movies.map((m) => (
          <li key={m.id} className="w-[118px] shrink-0 snap-start sm:w-[128px]">
            <Link to={`/movie/${m.id}`} className="block text-left" state={{ from: 'home' }}>
              <Card className="cursor-pointer overflow-hidden pt-0 transition-shadow hover:shadow-md">
                <div className="bg-muted aspect-[2/3] w-full overflow-hidden">
                  {m.posterUrl ? (
                    <img className="size-full object-cover" src={m.posterUrl} alt="" />
                  ) : (
                    <div className="text-muted-foreground flex size-full items-center justify-center text-[10px] leading-tight">
                      No poster
                    </div>
                  )}
                </div>
                <CardFooter className="flex flex-col items-start gap-0.5 px-2 py-1.5">
                  <CardTitle className="line-clamp-2 text-xs leading-tight">{m.title}</CardTitle>
                  {m.releaseYear != null && (
                    <span className="text-muted-foreground text-[10px]">{m.releaseYear}</span>
                  )}
                </CardFooter>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const [nowPlaying, setNowPlaying] = useState<CatalogMovieListItem[]>([])
  const [nowPlayingError, setNowPlayingError] = useState<string | null>(null)
  const [nowPlayingLoading, setNowPlayingLoading] = useState(true)

  const [searchResults, setSearchResults] = useState<CatalogMovieListItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [genreRails, setGenreRails] = useState<CatalogGenreRail[]>([])
  const [genreRailsLoading, setGenreRailsLoading] = useState(false)
  const [genreRailsError, setGenreRailsError] = useState<string | null>(null)
  const [trendingRefreshBusy, setTrendingRefreshBusy] = useState(false)
  const [genreRailsRefreshBusy, setGenreRailsRefreshBusy] = useState(false)

  const showingSearch = debouncedQuery.trim().length >= 2

  const refreshTrendingList = useCallback(async (): Promise<void> => {
    setTrendingRefreshBusy(true)
    setNowPlayingError(null)
    const res = await window.api.catalog.nowPlaying({ forceRefresh: true })
    if (res.ok) {
      setNowPlaying(res.results.filter(shouldIncludeCatalogListItem))
    } else {
      setNowPlaying([])
      setNowPlayingError(res.error)
    }
    setTrendingRefreshBusy(false)
  }, [])

  const refreshGenreRails = useCallback(async (): Promise<void> => {
    setGenreRailsRefreshBusy(true)
    setGenreRailsError(null)
    const res = await window.api.catalog.genreRails()
    if (res.ok) {
      setGenreRails(res.rails)
    } else {
      setGenreRails([])
      setGenreRailsError(res.error)
    }
    setGenreRailsRefreshBusy(false)
  }, [])

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
    let cancelled = false

    async function load(): Promise<void> {
      if (showingSearch) {
        setNowPlayingLoading(false)
        setSearchLoading(true)
        setSearchError(null)
        const res = await window.api.catalog.search(debouncedQuery.trim())
        if (cancelled) return
        setSearchLoading(false)
        if (res.ok) {
          setSearchResults(res.results.filter(shouldIncludeCatalogListItem))
        } else {
          setSearchResults([])
          setSearchError(res.error)
        }
        return
      }

      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      setNowPlayingLoading(true)
      setNowPlayingError(null)
      const res = await window.api.catalog.nowPlaying()
      if (cancelled) return
      setNowPlayingLoading(false)
      if (res.ok) {
        setNowPlaying(res.results.filter(shouldIncludeCatalogListItem))
      } else {
        setNowPlaying([])
        setNowPlayingError(res.error)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [debouncedQuery, showingSearch])

  useEffect(() => {
    if (showingSearch) {
      return
    }
    let cancelled = false
    setGenreRailsLoading(true)
    setGenreRailsError(null)
    void window.api.catalog.genreRails().then((res) => {
      if (cancelled) return
      setGenreRailsLoading(false)
      if (res.ok) {
        setGenreRails(res.rails)
      } else {
        setGenreRails([])
        setGenreRailsError(res.error)
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [showingSearch])

  const searchPending = query.trim().length >= 2 && debouncedQuery !== query
  const listLoading = showingSearch ? searchLoading || searchPending : nowPlayingLoading

  const sortedSearchResults = useMemo(
    () => sortSearchResults(searchResults, sortKey, sortOrder),
    [searchResults, sortKey, sortOrder]
  )

  const { items, listError, heading } = useMemo(() => {
    if (showingSearch) {
      return {
        items: sortedSearchResults,
        listError: searchError,
        heading: 'Search results'
      }
    }
    return {
      items: nowPlaying,
      listError: nowPlayingError,
      heading: 'Trending'
    }
  }, [showingSearch, sortedSearchResults, searchError, nowPlaying, nowPlayingError])

  const requestedPage = parseListPage(searchParams.get('page'))
  const totalPages = Math.max(1, Math.ceil(items.length / CATALOG_LIST_PAGE_SIZE))
  const currentPage = Math.min(requestedPage, totalPages)

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

  return (
    <div className="pb-8">
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b border-border px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Input
            className="max-w-md"
            placeholder="Search movies (TMDB)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {listLoading && <span className="text-muted-foreground text-sm">Loading…</span>}
        </div>
        {query.trim().length > 0 && query.trim().length < 2 && (
          <p className="text-muted-foreground mx-auto mt-2 max-w-6xl px-0 text-sm">
            Type at least 2 characters to search.
          </p>
        )}
      </div>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {heading}
            </h2>
            {!showingSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={nowPlayingLoading || trendingRefreshBusy}
                title="Rebuild the trending list from torrent indexers (ignores the 24h cache)"
                onClick={() => void refreshTrendingList()}
              >
                <RefreshCw
                  className={cn(
                    'size-3.5',
                    (nowPlayingLoading || trendingRefreshBusy) && 'animate-spin'
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
                  {sortOrder === 'asc' ? (
                    <ArrowUpNarrowWide aria-hidden />
                  ) : (
                    <ArrowDownWideNarrow aria-hidden />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
        {listError && (
          <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
            {listError}
          </p>
        )}
        {!listLoading && !listError && items.length === 0 && showingSearch && (
          <p className="text-muted-foreground text-sm">No titles match that search.</p>
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
        {!showingSearch && (
          <div className="border-border mt-12 space-y-10 border-t pt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                Browse by genre
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={genreRailsLoading || genreRailsRefreshBusy}
                title="Reload genre rails from TMDB"
                onClick={() => void refreshGenreRails()}
              >
                <RefreshCw
                  className={cn(
                    'size-3.5',
                    (genreRailsLoading || genreRailsRefreshBusy) && 'animate-spin'
                  )}
                />
                Refresh
              </Button>
            </div>
            {genreRailsLoading && (
              <p className="text-muted-foreground text-sm">Loading genre rows…</p>
            )}
            {genreRailsError && (
              <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
                {genreRailsError}
              </p>
            )}
            {!genreRailsLoading &&
              !genreRailsError &&
              genreRails.map((rail) => <GenreRailRow key={rail.genre.id} rail={rail} />)}
          </div>
        )}
      </div>
    </div>
  )
}
