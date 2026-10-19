import type { ReactElement } from 'react'
import type { TvShowListItem } from '@shared/tv'
import { ShowCard } from '@/components/show-card'
import { useShowListFacts } from '@/components/use-show-list-facts'
import { MOVIE_GRID_CLASS, MOVIE_RAIL_CLASS, MOVIE_RAIL_ITEM_CLASS } from '@/lib/movie-layout'

type RailShow = TvShowListItem & {
  rank?: number | null
  note?: string | null
  progress?: number | null
}

export function ShowGrid({ shows }: { shows: TvShowListItem[] }): ReactElement {
  const items = useShowListFacts(shows)
  return (
    <ul className={MOVIE_GRID_CLASS}>
      {items.map((s, index) => (
        <li key={s.id}>
          <ShowCard show={s} facts={s.facts} index={index} eager linkState={{ from: 'tv' }} />
        </li>
      ))}
    </ul>
  )
}

/** Horizontal strip of small show cards; `rank`, `note`, and `progress` are optional per item. */
export function ShowRail({ shows }: { shows: RailShow[] }): ReactElement {
  const items = useShowListFacts(shows)
  return (
    <ul className={MOVIE_RAIL_CLASS}>
      {items.map((s, index) => (
        <li key={s.id} className={MOVIE_RAIL_ITEM_CLASS}>
          <ShowCard
            size="sm"
            index={index}
            show={s}
            facts={s.facts}
            rank={s.rank}
            note={s.note}
            progress={s.progress}
            linkState={{ from: 'tv' }}
          />
        </li>
      ))}
    </ul>
  )
}
