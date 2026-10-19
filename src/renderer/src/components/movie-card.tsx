import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Film, Star } from 'lucide-react'
import { formatRuntime } from '@/lib/movie-meta'
import { cn } from '@/lib/utils'

function ratingTone(voteAverage: number): string {
  if (voteAverage >= 7.5) return 'fill-emerald-400 text-emerald-400'
  if (voteAverage >= 6) return 'fill-amber-400 text-amber-400'
  return 'fill-white/70 text-white/70'
}

function RatingBadge({ voteAverage }: { voteAverage: number | null }): ReactElement | null {
  if (voteAverage == null || voteAverage <= 0) return null
  return (
    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums shadow-sm backdrop-blur-sm">
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
  const genreLine = genres
    .filter((name) => name.trim().length > 0)
    .slice(0, 3)
    .join(' · ')
  const small = size === 'sm'

  return (
    <Link
      to={href}
      state={linkState}
      className="group block rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <div className="bg-muted ring-border/70 relative aspect-[2/3] overflow-hidden rounded-lg shadow-sm ring-1 transition duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-md group-focus-visible:-translate-y-1">
        {posterUrl ? (
          <img
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
            src={posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
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
          <span className="absolute top-2 left-2 inline-flex min-w-6 items-center justify-center rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums shadow-sm backdrop-blur-sm">
            <span className="sr-only">Rank </span>
            {rank}
          </span>
        ) : null}
        {statusBadge ? (
          <span
            className={cn(
              'absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase shadow-sm backdrop-blur-sm',
              statusBadge.muted ? 'bg-black/60 text-white/75' : 'bg-primary text-primary-foreground'
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
        >
          {title}
        </h3>
        {facts.length > 0 && (
          <p className="text-muted-foreground text-xs tabular-nums">{facts.join(' · ')}</p>
        )}
        {genreLine && (
          <p className="text-muted-foreground/80 truncate text-xs" title={genres.join(', ')}>
            {genreLine}
          </p>
        )}
        {note && <p className="text-primary text-xs font-medium">{note}</p>}
      </div>
    </Link>
  )
}
