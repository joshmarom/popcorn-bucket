import type { ReactElement } from 'react'
import { formatRuntime } from '@/lib/movie-meta'
import { cn } from '@/lib/utils'

export function MovieRatingBadge({
  voteAverage
}: {
  voteAverage: number | null
}): ReactElement | null {
  if (voteAverage == null || voteAverage <= 0) return null
  return (
    <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
      ★ {voteAverage.toFixed(1)}
    </span>
  )
}

export function MovieCardMeta({
  releaseYear,
  runtime,
  genres,
  compact = false
}: {
  releaseYear: number | null
  runtime: number | null
  genres: string[]
  compact?: boolean
}): ReactElement | null {
  const bits: string[] = []
  if (releaseYear != null) bits.push(String(releaseYear))
  if (runtime != null && runtime > 0) bits.push(formatRuntime(runtime))
  const genreLine = genres.filter((name) => name.trim().length > 0)
  if (bits.length === 0 && genreLine.length === 0) return null

  const text = compact ? 'text-[10px] leading-tight' : 'text-xs'
  return (
    <div className={cn('text-muted-foreground flex w-full flex-col gap-0.5', text)}>
      {bits.length > 0 && <span>{bits.join(' · ')}</span>}
      {genreLine.length > 0 && (
        <span className="line-clamp-2" title={genreLine.join(', ')}>
          {genreLine.join(', ')}
        </span>
      )}
    </div>
  )
}
