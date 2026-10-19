import type { ReactElement } from 'react'
import type { TvShowListItem } from '@shared/tv'
import { hasListPosterUrl, hasMeaningfulListOverview } from '@shared/catalog'
import { RailHeading, StreamingTopRail } from '@/components/discovery-rails'
import { ShowRail } from '@/components/show-grid'
import { useDiscoverList, type ListResponse } from '@/hooks/use-discover-list'
import { cn } from '@/lib/utils'

function includeShow(show: TvShowListItem): boolean {
  return hasListPosterUrl(show.posterUrl) || hasMeaningfulListOverview(show.overview)
}

function ShowListRail<T extends TvShowListItem & { rank?: number | null }>({
  id,
  title,
  subtitle,
  load
}: {
  id: string
  title: string
  subtitle?: string
  load: () => Promise<ListResponse<T>>
}): ReactElement | null {
  const { items } = useDiscoverList(load, id, includeShow)
  if (items.length === 0) return null
  return (
    <section className="space-y-4" aria-labelledby={id}>
      <RailHeading id={id} title={title} subtitle={subtitle} />
      <ShowRail shows={items} />
    </section>
  )
}

/** TV rails from TorrentClaw and TMDB. Each rail hides itself when its source has nothing. */
export function TvDiscoveryRails({ className }: { className?: string }): ReactElement {
  return (
    <div className={cn('space-y-12', className)}>
      <ShowListRail
        id="tv-popular"
        title="Popular on torrents"
        subtitle="Biggest swarms right now"
        load={() => window.api.discover.popularShows()}
      />
      <StreamingTopRail
        id="tv-streaming-top"
        titleSuffix=" · series"
        load={(service) => window.api.discover.streamingTopShows(service)}
        include={includeShow}
        renderItems={(items) => <ShowRail shows={items} />}
      />
      <ShowListRail
        id="tv-on-the-air"
        title="New episodes this week"
        subtitle="Airing in the next seven days"
        load={() =>
          window.api.tv
            .onTheAir()
            .then((res) =>
              res.ok
                ? { ok: true as const, items: res.results }
                : { ok: false as const, error: res.error }
            )
        }
      />
    </div>
  )
}
