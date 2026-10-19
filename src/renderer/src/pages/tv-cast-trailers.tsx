import type { CatalogCastMember, CatalogTrailer } from '@shared/catalog'
import { useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { embedliteTrailerSrc } from './movie/embedlite-trailer'

export function TvCastTrailers({
  cast,
  trailers
}: {
  cast: CatalogCastMember[]
  trailers: CatalogTrailer[]
}): ReactElement {
  const [tab, setTab] = useState<'cast' | 'trailers'>('cast')

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <Button
          type="button"
          variant={tab === 'cast' ? 'default' : 'ghost'}
          size="sm"
          className={cn(tab !== 'cast' && 'text-muted-foreground')}
          onClick={() => setTab('cast')}
        >
          Cast
        </Button>
        <Button
          type="button"
          variant={tab === 'trailers' ? 'default' : 'ghost'}
          size="sm"
          className={cn(tab !== 'trailers' && 'text-muted-foreground')}
          onClick={() => setTab('trailers')}
        >
          Trailers
        </Button>
      </div>

      {tab === 'cast' &&
        (cast.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cast.map((person, index) => (
              <li key={`${person.name}-${index}`} className="flex min-w-0 items-center gap-3">
                <div className="bg-muted size-11 shrink-0 overflow-hidden rounded-md">
                  {person.profileUrl ? (
                    <img className="size-full object-cover" src={person.profileUrl} alt="" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{person.name}</div>
                  {person.character ? (
                    <div className="text-muted-foreground truncate text-sm">{person.character}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No cast listed.</p>
        ))}

      {tab === 'trailers' &&
        (trailers.length > 0 ? (
          <div className="relative min-w-0 w-full max-w-full">
            <div
              role="region"
              aria-label="Trailers"
              tabIndex={0}
              className="touch-pan-x min-w-0 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth px-1 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
            >
              <div className="flex w-max snap-x snap-mandatory gap-4 py-0.5">
                {trailers.map((trailer) => (
                  <div
                    key={trailer.youtubeKey}
                    className="w-[min(62vw,30rem)] shrink-0 snap-center space-y-2"
                  >
                    <h2
                      className="line-clamp-2 text-sm font-medium leading-snug"
                      title={trailer.name}
                    >
                      {trailer.name}
                    </h2>
                    <div className="aspect-video w-full max-w-full overflow-hidden rounded-md bg-black shadow-md">
                      <iframe
                        title={trailer.name}
                        className="size-full max-h-full max-w-full border-0"
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                        src={embedliteTrailerSrc(trailer.youtubeKey, trailer.name)}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No trailers available.</p>
        ))}
    </div>
  )
}
