import type { CatalogMovieDetails } from '@shared/catalog'
import { useState, type ReactElement, type ReactNode } from 'react'
import { CalendarDays, Clock3, Star } from 'lucide-react'
import { PanelReveal, SlidingTabs } from '@/components/interaction-motion'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatRuntime, releaseYearFromDate } from '@/lib/movie-meta'
import {
  genrePart,
  partStyle,
  posterStyle,
  titleStyle,
  useActivePoster
} from '@/lib/screen-transition'
import { embedliteTrailerSrc } from './embedlite-trailer'
import type { OverviewSubTab } from './movie-types'

export function MovieOverviewTab({
  detail,
  overviewSubTab,
  onOverviewSubTabChange,
  posterActions
}: {
  detail: CatalogMovieDetails
  overviewSubTab: OverviewSubTab
  onOverviewSubTabChange: (t: OverviewSubTab) => void
  posterActions?: ReactNode
}): ReactElement {
  const poster = useActivePoster()
  const [subtabMoved, setSubtabMoved] = useState(false)
  const posterName = `poster-movie-${detail.id}`
  const headingName = `title-movie-${detail.id}`
  const releaseYear = releaseYearFromDate(detail.releaseDate)
  const runtime =
    detail.runtime != null && detail.runtime > 0 ? formatRuntime(detail.runtime) : null
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Card className="overflow-hidden p-0 shadow-md">
          <div className="bg-muted aspect-[2/3]">
            {detail.posterUrl ? (
              <img
                className="size-full object-cover"
                src={detail.posterUrl}
                alt=""
                style={posterStyle(posterName, poster)}
              />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
                No poster
              </div>
            )}
          </div>
        </Card>
        {posterActions}
      </aside>
      <article className="min-w-0 space-y-6">
        <header className="space-y-3">
          <p className="type-kicker">Movie</p>
          <h1 className="type-display" style={titleStyle(headingName, poster)}>
            {detail.title}
          </h1>
          {detail.tagline && (
            <p className="type-tagline text-muted-foreground mt-2">{detail.tagline}</p>
          )}
          <div
            className="type-meta mt-2 flex flex-wrap items-center gap-x-4 gap-y-2"
            style={partStyle('meta', posterName, poster)}
          >
            {releaseYear != null && (
              <span
                className="text-muted-foreground inline-flex items-center gap-1.5"
                title={detail.releaseDate ?? undefined}
              >
                <CalendarDays className="size-4" aria-hidden />
                {releaseYear}
              </span>
            )}
            {runtime && (
              <span className="text-muted-foreground inline-flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden />
                {runtime}
              </span>
            )}
            {detail.voteAverage != null && detail.voteAverage > 0 && (
              <span className="text-primary inline-flex items-center gap-1.5 font-semibold">
                <Star className="size-4 fill-current" aria-hidden />
                {detail.voteAverage.toFixed(1)}
              </span>
            )}
            {detail.omdb?.rated && <Badge variant="secondary">{detail.omdb.rated}</Badge>}
            {detail.omdb?.metascore != null && detail.omdb.metascore !== 'N/A' && (
              <Badge variant="secondary">Metascore {detail.omdb.metascore}</Badge>
            )}
            {detail.imdbId && (
              <span className="text-muted-foreground text-sm">IMDb {detail.imdbId}</span>
            )}
            {detail.omdb?.imdbVotes && (
              <span className="text-muted-foreground text-sm">
                {detail.omdb.imdbVotes} IMDb votes
              </span>
            )}
          </div>
        </header>
        {detail.genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {detail.genres.map((g) => (
              <Badge
                key={g}
                variant="secondary"
                style={partStyle(genrePart(g), posterName, poster)}
              >
                {g}
              </Badge>
            ))}
          </div>
        )}
        <p className="type-prose text-foreground">{detail.overview}</p>

        <section className="space-y-4 border-t border-border pt-6" aria-label="Movie extras">
          <SlidingTabs
            label="Cast and trailers"
            tabs={[
              { id: 'cast', label: 'Cast' },
              { id: 'trailers', label: 'Trailers' }
            ]}
            value={overviewSubTab}
            onChange={(tab) => {
              setSubtabMoved(true)
              onOverviewSubTabChange(tab)
            }}
          />

          {overviewSubTab === 'cast' && (
            <PanelReveal instant={!subtabMoved}>
              <div>
                {detail.cast.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detail.cast.map((c, i) => (
                      <li key={`${c.name}-${i}`} className="flex min-w-0 items-center gap-3">
                        <div className="bg-muted size-11 shrink-0 overflow-hidden rounded-md">
                          {c.profileUrl ? (
                            <img className="size-full object-cover" src={c.profileUrl} alt="" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          {c.character ? (
                            <div className="text-muted-foreground truncate text-sm">
                              {c.character}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">No cast listed.</p>
                )}
              </div>
            </PanelReveal>
          )}

          {overviewSubTab === 'trailers' && (
            <PanelReveal instant={!subtabMoved}>
              <div className="min-w-0 max-w-full">
                {detail.trailers.length > 0 ? (
                  <div className="relative min-w-0 w-full max-w-full">
                    <div
                      role="region"
                      aria-label="Trailers"
                      tabIndex={0}
                      className="touch-pan-x min-w-0 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth px-1 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
                    >
                      <div className="flex w-max snap-x snap-mandatory gap-4 py-0.5">
                        {detail.trailers.map((t) => (
                          <div
                            key={t.youtubeKey}
                            className="w-[min(62vw,30rem)] shrink-0 snap-center space-y-2"
                          >
                            <h2
                              className="line-clamp-2 text-sm font-medium leading-snug"
                              title={t.name}
                            >
                              {t.name}
                            </h2>
                            <div className="aspect-video w-full max-w-full overflow-hidden rounded-md bg-black shadow-md">
                              <iframe
                                title={t.name}
                                className="size-full max-h-full max-w-full border-0"
                                loading="lazy"
                                referrerPolicy="strict-origin-when-cross-origin"
                                src={embedliteTrailerSrc(t.youtubeKey, t.name)}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-12 bg-gradient-to-r from-black/50 to-transparent"
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-12 bg-gradient-to-l from-black/50 to-transparent"
                      aria-hidden
                    />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No trailers available.</p>
                )}
              </div>
            </PanelReveal>
          )}
        </section>
      </article>
    </div>
  )
}
