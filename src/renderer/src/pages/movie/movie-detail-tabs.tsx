import type { ReactElement } from 'react'
import { SlidingTabs } from '@/components/interaction-motion'
import type { DetailTab } from './movie-types'

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sources', label: 'Sources' },
  { id: 'vidking', label: 'VidCore' }
]

export function MovieDetailTabs({
  tab,
  onTabChange
}: {
  tab: DetailTab
  onTabChange: (t: DetailTab) => void
}): ReactElement {
  return <SlidingTabs label="Movie details" tabs={TABS} value={tab} onChange={onTabChange} />
}
