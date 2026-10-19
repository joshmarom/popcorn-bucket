import type { ReactElement, ReactNode } from 'react'
import type { TvShowListFacts, TvShowListItem } from '@shared/tv'
import { SHOW_STATUS_LABEL, seasonLabel, showStatus, yearSpan } from '@shared/tv-meta'
import { MovieCard } from '@/components/movie-card'

/** Poster card for a show: year span, season count, genres, rating, and airing status. */
export function ShowCard({
  show,
  facts,
  size = 'md',
  rank,
  note,
  progress,
  linkState,
  index = 0,
  eager,
  action
}: {
  show: TvShowListItem
  facts: TvShowListFacts | null
  size?: 'md' | 'sm'
  rank?: number | null
  note?: string | null
  progress?: number | null
  linkState?: unknown
  index?: number
  eager?: boolean
  action?: ReactNode
}): ReactElement {
  const first = facts?.firstAirYear ?? show.firstAirYear
  const years = yearSpan(first, facts?.lastAirYear ?? null, facts?.tmdbStatus ?? null)
  const seasons = seasonLabel(facts?.seasonCount ?? null)
  const status = facts ? showStatus(facts) : null
  const badge =
    status === 'new'
      ? { label: SHOW_STATUS_LABEL.new }
      : status === 'ended'
        ? { label: SHOW_STATUS_LABEL.ended, muted: true }
        : null

  return (
    <MovieCard
      size={size}
      href={`/tv/${show.id}`}
      linkState={linkState}
      title={show.name}
      posterUrl={show.posterUrl}
      releaseYear={first}
      runtime={null}
      genres={show.genres.length > 0 ? show.genres : (facts?.genres ?? [])}
      voteAverage={show.voteAverage ?? facts?.voteAverage ?? null}
      facts={[years, seasons].filter((f): f is string => Boolean(f))}
      statusBadge={badge}
      rank={rank}
      note={note}
      progress={progress}
      index={index}
      eager={eager}
      action={action}
    />
  )
}
