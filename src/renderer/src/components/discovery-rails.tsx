import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'
import {
  STREAMING_SERVICES,
  type DiscoverCollection,
  type DiscoverListResponse,
  type DiscoverMovieItem,
  type StreamingService
} from '@shared/discovery'
import { shouldIncludeCatalogListItem } from '@shared/catalog'
import { MovieCard } from '@/components/movie-card'
import { useMovieListFacts } from '@/components/use-movie-list-facts'
import { Button } from '@/components/ui/button'
import { MOVIE_RAIL_CLASS, MOVIE_RAIL_ITEM_CLASS } from '@/lib/movie-layout'
import { cn } from '@/lib/utils'
import { useDiscoverList, type ListResponse } from '@/hooks/use-discover-list'

const RAIL_MAX = 20

export function RailHeading({
  id,
  title,
  subtitle,
  children
}: {
  id: string
  title: string
  subtitle?: string
  children?: ReactNode
}): ReactElement {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 pe-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={id} className="type-kicker">
          {title}
        </h3>
        {subtitle ? <span className="text-muted-foreground text-xs">{subtitle}</span> : null}
      </div>
      {children}
    </div>
  )
}

function MovieRail({ items }: { items: DiscoverMovieItem[] }): ReactElement {
  const movies = useMovieListFacts(items)
  return (
    <ul className={MOVIE_RAIL_CLASS}>
      {movies.map((m) => (
        <li key={m.id} className={MOVIE_RAIL_ITEM_CLASS}>
          <MovieCard
            size="sm"
            href={`/movie/${m.id}`}
            linkState={{ from: 'home' }}
            title={m.title}
            posterUrl={m.posterUrl}
            releaseYear={m.releaseYear}
            runtime={m.runtime}
            genres={m.genres}
            voteAverage={m.voteAverage}
            rank={m.rank}
          />
        </li>
      ))}
    </ul>
  )
}

function ListRail({
  id,
  title,
  subtitle,
  load
}: {
  id: string
  title: string
  subtitle?: string
  load: () => Promise<DiscoverListResponse>
}): ReactElement | null {
  const { items } = useDiscoverList(load, id, shouldIncludeCatalogListItem)
  if (items.length === 0) return null
  return (
    <section className="space-y-4" aria-labelledby={id}>
      <RailHeading id={id} title={title} subtitle={subtitle} />
      <MovieRail items={items} />
    </section>
  )
}

/**
 * A streaming service Top 10 with service tabs. Until one chart loads it moves on to the next
 * service, and it hides entirely if none have a chart.
 */
export function StreamingTopRail<T>({
  id,
  titleSuffix = '',
  load,
  include,
  renderItems
}: {
  id: string
  /** Appended to "Top 10 on {service}", e.g. " · series". */
  titleSuffix?: string
  load: (service: StreamingService) => Promise<ListResponse<T>>
  include: (item: T) => boolean
  renderItems: (items: T[]) => ReactElement
}): ReactElement | null {
  const [service, setService] = useState<StreamingService>('netflix')
  const [unavailable, setUnavailable] = useState<Set<StreamingService>>(() => new Set())
  const [everLoaded, setEverLoaded] = useState(false)
  const everLoadedRef = useRef(false)
  const emptyRef = useRef(new Set<StreamingService>())
  const { items, loading } = useDiscoverList(
    () =>
      load(service).then((res) => {
        if (res.ok && res.items.length > 0) {
          everLoadedRef.current = true
          setEverLoaded(true)
          return res
        }
        emptyRef.current.add(service)
        setUnavailable(new Set(emptyRef.current))
        // Until one chart has loaded, move on instead of showing an empty rail.
        if (!everLoadedRef.current) {
          const untried = STREAMING_SERVICES.find((s) => !emptyRef.current.has(s.id))
          if (untried) setService(untried.id)
        }
        return res
      }),
    `${id}-${service}`,
    include
  )

  if (!everLoaded && (loading || items.length === 0)) return null
  const services = STREAMING_SERVICES.filter((s) => !unavailable.has(s.id) || s.id === service)
  const label = STREAMING_SERVICES.find((s) => s.id === service)?.label ?? ''

  return (
    <section className="space-y-4" aria-labelledby={id}>
      <RailHeading id={id} title={`Top 10 on ${label}${titleSuffix}`}>
        <div role="tablist" aria-label="Streaming service" className="flex flex-wrap gap-1">
          {services.map((s) => (
            <Button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === service}
              variant={s.id === service ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setService(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </RailHeading>
      {items.length > 0 ? (
        renderItems(items)
      ) : (
        <p className="text-muted-foreground py-8 text-sm">
          {loading ? 'Loading…' : `No ${label} chart right now.`}
        </p>
      )}
    </section>
  )
}

function CollectionCard({ c }: { c: DiscoverCollection }): ReactElement {
  return (
    <Link
      to={`/collection/${c.id}`}
      className="group block rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <div className="bg-muted ring-border/70 relative aspect-[2/3] overflow-hidden rounded-lg shadow-sm ring-1 transition duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-md">
        {c.posterUrl ? (
          <img
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
            src={c.posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <Layers aria-hidden className="size-6" />
          </div>
        )}
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums shadow-sm backdrop-blur-sm">
          <Layers aria-hidden className="size-3" />
          {c.movieCount}
        </span>
      </div>
      <h3
        className="mt-1.5 line-clamp-2 px-0.5 text-sm leading-snug font-medium text-balance"
        title={c.name}
      >
        {c.name.replace(/\s+Collection$/i, '')}
      </h3>
    </Link>
  )
}

function CollectionsRail(): ReactElement | null {
  const [collections, setCollections] = useState<DiscoverCollection[]>([])
  useEffect(() => {
    let cancelled = false
    window.api.discover
      .collections()
      .then((res) => {
        if (!cancelled && res.ok) setCollections(res.collections.slice(0, RAIL_MAX))
      })
      .catch(() => {})
    return (): void => {
      cancelled = true
    }
  }, [])
  if (collections.length === 0) return null
  return (
    <section className="space-y-4" aria-labelledby="discover-collections">
      <RailHeading id="discover-collections" title="Collections" subtitle="Sagas and series" />
      <ul className={MOVIE_RAIL_CLASS}>
        {collections.map((c) => (
          <li key={c.id} className={MOVIE_RAIL_ITEM_CLASS}>
            <CollectionCard c={c} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Home rails from TorrentClaw. Each rail hides itself when TorrentClaw has nothing for it. */
export function DiscoveryRails({ className }: { className?: string }): ReactElement {
  return (
    <div className={cn('space-y-12', className)}>
      <ListRail
        id="discover-popular"
        title="Popular on torrents"
        subtitle="Biggest swarms right now"
        load={() => window.api.discover.popular()}
      />
      <StreamingTopRail<DiscoverMovieItem>
        id="discover-streaming-top"
        load={(service) => window.api.discover.streamingTop(service)}
        include={shouldIncludeCatalogListItem}
        renderItems={(items) => <MovieRail items={items} />}
      />
      <ListRail
        id="discover-upcoming"
        title="Upcoming"
        subtitle="Next six months"
        load={() => window.api.discover.upcoming()}
      />
      <CollectionsRail />
    </div>
  )
}
