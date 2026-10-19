import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement
} from 'react'
import { Link } from 'react-router-dom'
import { Film, Star } from 'lucide-react'
import { formatRuntime } from '@/lib/movie-meta'
import {
  CardScopeContext,
  cardSourceKey,
  genrePart,
  partStyle,
  posterStyle,
  posterTransitionName,
  titleStyle,
  titleTransitionName,
  useScreenTransition
} from '@/lib/screen-transition'
import { cn } from '@/lib/utils'

function ratingTone(voteAverage: number): string {
  if (voteAverage >= 7.5) return 'fill-emerald-400 text-emerald-400'
  if (voteAverage >= 6) return 'fill-amber-400 text-amber-400'
  return 'fill-white/70 text-white/70'
}

function RatingBadge({ voteAverage }: { voteAverage: number | null }): ReactElement | null {
  if (voteAverage == null || voteAverage <= 0) return null
  return (
    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums shadow-sm">
      <Star aria-hidden className={cn('size-3', ratingTone(voteAverage))} />
      {voteAverage.toFixed(1)}
      <span className="sr-only"> out of 10</span>
    </span>
  )
}

export function MovieCard({
  href,
  linkState,
  title,
  posterUrl,
  releaseYear,
  runtime,
  genres,
  voteAverage,
  progress,
  note,
  rank,
  index = 0,
  eager = false,
  facts: factsOverride,
  statusBadge,
  size = 'md'
}: {
  href: string
  linkState?: unknown
  title: string
  posterUrl: string | null
  releaseYear: number | null
  runtime: number | null
  genres: string[]
  voteAverage: number | null
  /** Watched share, 0 to 1. */
  progress?: number | null
  note?: string | null
  /** Chart position (e.g. streaming Top 10), shown in the poster corner. */
  rank?: number | null
  /** Position in the grid. Earlier cards fade in first, top to bottom. */
  index?: number
  /**
   * Load the poster right away. Paged grids use this: native lazy loading can miss rows that
   * appear while the page is scrolling or mid-transition, leaving them blank until scrolled away.
   */
  eager?: boolean
  /** Replaces the year · runtime line (e.g. "2019–2024 · 4 seasons" for shows). */
  facts?: string[]
  /** Pill in the poster's bottom corner; `muted` for low-key states such as "Ended". */
  statusBadge?: { label: string; muted?: boolean } | null
  size?: 'md' | 'sm'
}): ReactElement {
  const facts: string[] = factsOverride ? factsOverride.filter(Boolean) : []
  if (!factsOverride) {
    if (releaseYear != null) facts.push(String(releaseYear))
    if (runtime != null && runtime > 0) facts.push(formatRuntime(runtime))
  }
  const shownGenres = genres.filter((name) => name.trim().length > 0).slice(0, 3)
  const small = size === 'sm'
  const sharedName = posterTransitionName(href)
  const titleName = titleTransitionName(href)
  const transition = useScreenTransition()
  const sourceKey = cardSourceKey(useContext(CardScopeContext), href)
  const poster = transition.source === sourceKey ? transition.poster : null
  const morphParts = sharedName?.startsWith('poster-movie-') ? sharedName : null
  const [loaded, setLoaded] = useState<{ src: string; instant: boolean } | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const retriedSrc = useRef<string | null>(null)
  const retryTimer = useRef<number | undefined>(undefined)
  const posterRef = useRef<HTMLImageElement>(null)
  const morphing = sharedName != null && poster === sharedName
  const posterShown = posterUrl != null && loaded?.src === posterUrl
  const posterFailed = posterUrl != null && failedSrc === posterUrl
  useLayoutEffect(() => {
    const img = posterRef.current
    if (posterUrl && img?.complete && img.naturalWidth > 0) {
      setLoaded({ src: posterUrl, instant: true })
    }
  }, [posterUrl])
  useEffect(() => {
    return () => window.clearTimeout(retryTimer.current)
  }, [])
  const onPosterError = (): void => {
    const img = posterRef.current
    if (!posterUrl || !img) return
    if (retriedSrc.current === posterUrl) {
      setFailedSrc(posterUrl)
      return
    }
    retriedSrc.current = posterUrl
    retryTimer.current = window.setTimeout(() => {
      if (img.isConnected && img.getAttribute('src') === posterUrl) img.src = posterUrl
    }, 800)
  }
  const linkStateRecord =
    linkState != null && typeof linkState === 'object' ? (linkState as Record<string, unknown>) : {}

  return (
    <Link
      to={href}
      state={{ ...linkStateRecord, vtPosterUrl: posterUrl }}
      data-vt-poster={sharedName ?? undefined}
      data-vt-source={sharedName ? sourceKey : undefined}
      data-vt-poster-url={posterUrl ?? undefined}
      data-vt-title={title}
      data-vt-meta={morphParts && facts.length > 0 ? facts.join(' · ') : undefined}
      data-vt-genres={morphParts && shownGenres.length > 0 ? shownGenres.join('|') : undefined}
      data-vt-from={typeof linkStateRecord.from === 'string' ? linkStateRecord.from : undefined}
      className="group block rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <div className="bg-muted ring-border/70 relative aspect-[2/3] overflow-hidden rounded-lg shadow-sm ring-1 transition duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-md group-focus-visible:-translate-y-1">
        {posterUrl && !posterFailed ? (
          <img
            className={cn(
              'size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]',
              't-poster',
              (posterShown || morphing) && 'is-shown',
              (morphing || (posterShown && loaded?.instant)) && 'is-held'
            )}
            ref={posterRef}
            src={posterUrl}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() =>
              setLoaded((prev) =>
                prev?.src === posterUrl ? prev : { src: posterUrl, instant: false }
              )
            }
            onError={onPosterError}
            style={
              {
                ...(sharedName ? posterStyle(sharedName, poster) : undefined),
                '--stagger-index': Math.min(index, 18)
              } as CSSProperties
            }
          />
        ) : (
          <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2 px-3 text-center">
            <Film aria-hidden className={small ? 'size-5' : 'size-7'} />
            <span className="line-clamp-3 text-xs leading-snug font-medium text-balance">
              {title}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-black/5 ring-inset dark:ring-white/10" />
        <RatingBadge voteAverage={voteAverage} />
        {rank != null ? (
          <span className="absolute top-2 left-2 inline-flex min-w-6 items-center justify-center rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums shadow-sm">
            <span className="sr-only">Rank </span>
            {rank}
          </span>
        ) : null}
        {statusBadge ? (
          <span
            className={cn(
              'absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase shadow-sm',
              statusBadge.muted ? 'bg-black/75 text-white/75' : 'bg-primary text-primary-foreground'
            )}
          >
            {statusBadge.label}
          </span>
        ) : null}
        {progress != null && progress > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              className="bg-primary h-full"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-2 space-y-1 px-0.5">
        <h3
          className="group-hover:text-foreground/80 line-clamp-2 text-sm leading-snug font-medium text-balance transition-colors"
          title={title}
          style={titleName ? titleStyle(titleName, poster) : undefined}
        >
          {title}
        </h3>
        {facts.length > 0 && (
          <p className="text-muted-foreground text-xs tabular-nums">
            <span style={partStyle('meta', morphParts, poster)}>{facts.join(' · ')}</span>
          </p>
        )}
        {shownGenres.length > 0 && (
          <p className="text-muted-foreground/80 truncate text-xs" title={genres.join(', ')}>
            {shownGenres.map((genre, i) => (
              <Fragment key={genre}>
                {i > 0 && ' · '}
                <span style={partStyle(genrePart(genre), morphParts, poster)}>{genre}</span>
              </Fragment>
            ))}
          </p>
        )}
        {note && <p className="text-primary text-xs font-medium">{note}</p>}
      </div>
    </Link>
  )
}
