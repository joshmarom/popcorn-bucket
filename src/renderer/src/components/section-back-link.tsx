import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BROWSE_SECTIONS, type BrowseSection } from '@/lib/browse-sections'

/** "‹ Movies" / "‹ TV shows": says where Back goes instead of a bare "Back". */
export function SectionBackLink({ section }: { section: BrowseSection }): ReactElement {
  const { label, path, icon: Icon } = BROWSE_SECTIONS[section]
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:text-foreground -ms-2 gap-1.5"
      asChild
    >
      <Link to={path}>
        <ChevronLeft aria-hidden className="size-4" />
        <Icon aria-hidden className="size-4" />
        {label}
      </Link>
    </Button>
  )
}
