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
    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums shadow-sm backdrop-blur-sm">
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
  size?: 'md' | 'sm'
}): ReactElement {
  const facts: string[] = []
  if (releaseYear != null) facts.push(String(releaseYear))
  if (runtime != null && runtime > 0) facts.push(formatRuntime(runtime))
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
      <div className="bg-muted ring-border/70 relative aspect-[2/3] overflow-hidden rounded-lg shadow-sm ring-1 transition duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-focus-visible:-translate-y-1">
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
            <span className={cn('line-clamp-3 font-medium', small ? 'text-[11px]' : 'text-xs')}>
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
        {progress != null && progress > 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              className="bg-primary h-full"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className={cn('space-y-0.5 px-0.5', small ? 'mt-1.5' : 'mt-2.5')}>
        <h3
          className={cn(
            'group-hover:text-foreground/80 line-clamp-2 leading-snug font-medium transition-colors',
            small ? 'text-xs' : 'text-sm'
          )}
          title={title}
        >
          {title}
        </h3>
        {facts.length > 0 && (
          <p
            className={cn('text-muted-foreground tabular-nums', small ? 'text-[11px]' : 'text-xs')}
          >
            {facts.join(' · ')}
          </p>
        )}
        {genreLine && (
          <p
            className={cn(
              'text-muted-foreground/80 truncate',
              small ? 'text-[10px]' : 'text-[11px]'
            )}
            title={genres.join(', ')}
          >
            {genreLine}
          </p>
        )}
        {note && (
          <p className={cn('text-primary font-medium', small ? 'text-[10px]' : 'text-[11px]')}>
            {note}
          </p>
        )}
      </div>
    </Link>
  )
}
