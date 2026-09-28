import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, RefreshCw } from 'lucide-react'
import type { TvGenreRail } from '@shared/tv'
import { ShowRail } from '@/components/show-grid'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function GenreRailRow({ rail }: { rail: TvGenreRail }): ReactElement {
  const nameQ = encodeURIComponent(rail.genre.name)
  return (
    <section className="space-y-2" aria-labelledby={`tv-genre-rail-${rail.genre.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 pe-1">
        <h3
          id={`tv-genre-rail-${rail.genre.id}`}
          className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
        >
          {rail.genre.name}
        </h3>
        <Button
          variant="link"
          className="text-muted-foreground hover:text-foreground h-auto p-0 text-sm"
          asChild
        >
          <Link to={`/tv/genre/${rail.genre.id}?name=${nameQ}`}>
            All in {rail.genre.name}
            <ChevronRight aria-hidden className="ml-0.5 inline size-4 align-text-bottom" />
          </Link>
        </Button>
      </div>
      <ShowRail shows={rail.shows} />
    </section>
  )
}

/** "Browse by genre" for TV: one TMDB-popular rail per genre, each linking to its full page. */
export function TvGenreRails(): ReactElement {
  const [rails, setRails] = useState<TvGenreRail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    const res = await window.api.tv.genreRails()
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
    void window.api.tv.genreRails().then((res) => {
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
      {rails.map((rail) => (
        <GenreRailRow key={rail.genre.id} rail={rail} />
      ))}
    </div>
  )
}
