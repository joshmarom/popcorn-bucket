import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DetailTab } from './movie-types'

export function MovieDetailTabs({
  tab,
  onTabChange
}: {
  tab: DetailTab
  onTabChange: (t: DetailTab) => void
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-2">
      <Button
        type="button"
        variant={tab === 'overview' ? 'default' : 'ghost'}
        size="sm"
        className={cn(tab !== 'overview' && 'text-muted-foreground')}
        onClick={() => onTabChange('overview')}
      >
        Overview
      </Button>
      <Button
        type="button"
        variant={tab === 'sources' ? 'default' : 'ghost'}
        size="sm"
        className={cn(tab !== 'sources' && 'text-muted-foreground')}
        onClick={() => onTabChange('sources')}
      >
        Sources
      </Button>
      <Button
        type="button"
        variant={tab === 'vidking' ? 'default' : 'ghost'}
        size="sm"
        className={cn(tab !== 'vidking' && 'text-muted-foreground')}
        onClick={() => onTabChange('vidking')}
      >
        VidCore
      </Button>
    </div>
  )
}
