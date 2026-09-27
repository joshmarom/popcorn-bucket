import type { CatalogMovieDetails } from '@shared/catalog'
import type { ReactElement } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { embedliteTrailerSrc } from './embedlite-trailer'
import type { OverviewSubTab } from './movie-types'

export function MovieOverviewTab({
  detail,
  overviewSubTab,
  onOverviewSubTabChange
}: {
  detail: CatalogMovieDetails
  overviewSubTab: OverviewSubTab
  onOverviewSubTabChange: (t: OverviewSubTab) => void
}): ReactElement {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
      <div>
        <Card className="overflow-hidden p-0">
          <div className="bg-muted aspect-[2/3]">
            {detail.posterUrl ? (
              <img className="size-full object-cover" src={detail.posterUrl} alt="" />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
                No poster
              </div>
            )}
          </div>
        </Card>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{detail.title}</h1>
          {detail.tagline && (
            <p className="text-muted-foreground mt-2 text-sm italic">{detail.tagline}</p>
          )}
          <p className="text-muted-foreground mt-2 text-sm">
            {[detail.releaseDate, detail.runtime != null ? `${detail.runtime} min` : null]
              .filter(Boolean)
              .join(' · ')}
            {detail.voteAverage != null && ` · ★ ${detail.voteAverage.toFixed(1)}`}
            {detail.imdbId && ` · ${detail.imdbId}`}
            {detail.omdb?.rated && ` · ${detail.omdb.rated}`}
            {detail.omdb?.metascore != null &&
              detail.omdb.metascore !== 'N/A' &&
              ` · Metacritic ${detail.omdb.metascore}`}
            {detail.omdb?.imdbVotes && ` · ${detail.omdb.imdbVotes} IMDb votes`}
          </p>
        </div>
        {detail.genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {detail.genres.map((g) => (
              <Badge key={g} variant="secondary">
                {g}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-foreground max-w-prose leading-relaxed">{detail.overview}</p>

        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2 border-b border-border pb-2">
            <Button
              type="button"
              variant={overviewSubTab === 'cast' ? 'default' : 'ghost'}
              size="sm"
              className={cn(overviewSubTab !== 'cast' && 'text-muted-foreground')}
              onClick={() => onOverviewSubTabChange('cast')}
            >
              Cast
            </Button>
            <Button
              type="button"
              variant={overviewSubTab === 'trailers' ? 'default' : 'ghost'}
              size="sm"
              className={cn(overviewSubTab !== 'trailers' && 'text-muted-foreground')}
              onClick={() => onOverviewSubTabChange('trailers')}
            >
              Trailers
            </Button>
          </div>

          {overviewSubTab === 'cast' && (
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
          )}

          {overviewSubTab === 'trailers' && (
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
          )}
        </div>
      </div>
    </div>
  )
}
