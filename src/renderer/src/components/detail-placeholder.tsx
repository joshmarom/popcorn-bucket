import { type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { genrePart } from '@/lib/screen-transition'
import { cn } from '@/lib/utils'

function Bar({ className }: { className?: string }): ReactElement {
  return <div className={cn('t-skel-bar bg-muted rounded-md', className)} />
}

export function DetailReveal({
  revealed,
  placeholder,
  children
}: {
  revealed: boolean
  placeholder: ReactNode
  children: ReactNode
}): ReactElement {
  return revealed ? <>{children}</> : <div aria-busy="true">{placeholder}</div>
}

export function MovieDetailPlaceholder({
  title,
  meta,
  genres,
  posterSrc,
  posterStyle,
  titleStyle,
  partStyle
}: {
  title: string | null
  /** The card's "year · runtime" line, so it can travel into place before details load. */
  meta?: string | null
  genres?: string[]
  posterSrc: string | null
  posterStyle?: CSSProperties
  titleStyle?: CSSProperties
  partStyle?: (part: string) => CSSProperties | undefined
}): ReactElement {
  return (
    <div className="space-y-4">
      <Bar className="h-9 w-64 rounded-full" />
      <div className="grid gap-6 md:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="bg-muted aspect-[2/3] overflow-hidden rounded-xl">
            {posterSrc ? (
              <img className="size-full object-cover" src={posterSrc} alt="" style={posterStyle} />
            ) : null}
          </div>
          <Bar className="h-11" />
          <Bar className="h-11" />
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            {title ? (
              <h1 className="type-display" style={titleStyle}>
                {title}
              </h1>
            ) : (
              <Bar className="h-9 w-3/4" />
            )}
            {meta ? (
              <p className="type-meta text-muted-foreground mt-2">
                <span style={partStyle?.('meta')}>{meta}</span>
              </p>
            ) : (
              <Bar className="mt-2 h-4 w-2/3" />
            )}
          </div>
          {genres && genres.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <Badge key={genre} variant="secondary" style={partStyle?.(genrePart(genre))}>
                  {genre}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <Bar className="h-6 w-16" />
              <Bar className="h-6 w-20" />
              <Bar className="h-6 w-14" />
            </div>
          )}
          <div className="space-y-2">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-11/12" />
            <Bar className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ShowDetailPlaceholder({
  title,
  posterSrc,
  posterStyle,
  titleStyle
}: {
  title: string | null
  posterSrc: string | null
  posterStyle?: CSSProperties
  titleStyle?: CSSProperties
}): ReactElement {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="bg-muted aspect-[2/3] overflow-hidden rounded-xl">
            {posterSrc ? (
              <img className="size-full object-cover" src={posterSrc} alt="" style={posterStyle} />
            ) : null}
          </div>
          <Bar className="h-11" />
        </div>
        <div className="min-w-0 space-y-4">
          {title ? (
            <h1 className="type-display" style={titleStyle}>
              {title}
            </h1>
          ) : (
            <Bar className="h-9 w-3/4" />
          )}
          <Bar className="h-4 w-40" />
          <div className="flex gap-2">
            <Bar className="h-6 w-16" />
            <Bar className="h-6 w-20" />
          </div>
          <div className="space-y-2">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-2/3" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <Bar className="h-16 w-full" />
        <Bar className="h-16 w-full" />
        <Bar className="h-16 w-full" />
      </div>
    </div>
  )
}
