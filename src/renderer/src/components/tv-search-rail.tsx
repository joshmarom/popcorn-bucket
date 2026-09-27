import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { TvShowListItem } from '@shared/tv'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'

/** TV shows matching the home search, shown above the movie results. */
export function TvSearchRail({ query }: { query: string }): ReactElement | null {
  const [shows, setShows] = useState<TvShowListItem[]>([])

  useEffect(() => {
    let cancelled = false
    void window.api.tv.search(query).then((res) => {
      if (!cancelled) setShows(res.ok ? res.results.filter((s) => s.posterUrl).slice(0, 20) : [])
    })
    return (): void => {
      cancelled = true
    }
  }, [query])

  if (shows.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
        TV shows
      </h2>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {shows.map((s) => (
          <li key={s.id} className="w-[118px] shrink-0 snap-start sm:w-[128px]">
            <Link to={`/tv/${s.id}`} className="block text-left">
              <Card className="overflow-hidden pt-0 transition-shadow hover:shadow-md">
                <div className="bg-muted aspect-[2/3] w-full overflow-hidden">
                  <img className="size-full object-cover" src={s.posterUrl!} alt="" />
                </div>
                <CardFooter className="flex flex-col items-start gap-0.5 px-2 py-1.5">
                  <CardTitle className="line-clamp-2 text-xs leading-tight">{s.name}</CardTitle>
                  {s.firstAirYear != null && (
                    <span className="text-muted-foreground text-[10px]">{s.firstAirYear}</span>
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
