import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { SearchAutocomplete } from '@/components/search-autocomplete'
import { BROWSE_SECTION_ORDER, BROWSE_SECTIONS, type BrowseSection } from '@/lib/browse-sections'
import { cn } from '@/lib/utils'

/** Movies / TV shows switch. Carries the search query across, so switching re-runs it there. */
function SectionSwitch({
  section,
  query
}: {
  section: BrowseSection
  query: string
}): ReactElement {
  const q = query.trim()
  return (
    <nav
      aria-label="Browse"
      className="bg-muted inline-flex h-9 shrink-0 items-center gap-1 rounded-lg p-1"
    >
      {BROWSE_SECTION_ORDER.map((id) => {
        const { label, path, icon: Icon } = BROWSE_SECTIONS[id]
        const active = id === section
        return (
          <Link
            key={id}
            to={q ? `${path}?q=${encodeURIComponent(q)}` : path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors outline-none',
              'focus-visible:ring-ring/60 focus-visible:ring-[3px]',
              active
                ? 'bg-background dark:bg-accent text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** The sticky top bar shared by the Movies and TV shows browse pages. */
export function BrowseHeader({
  section,
  query,
  onQueryChange,
  loading
}: {
  section: BrowseSection
  query: string
  onQueryChange: (query: string) => void
  loading: boolean
}): ReactElement {
  const { label, searchPlaceholder } = BROWSE_SECTIONS[section]
  const tooShort = query.trim().length > 0 && query.trim().length < 2
  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 border-border sticky top-0 z-10 border-b px-4 py-3 backdrop-blur-sm">
      <h1 className="sr-only">{label}</h1>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
        <SectionSwitch section={section} query={query} />
        <SearchAutocomplete
          className="w-full max-w-md flex-1"
          placeholder={searchPlaceholder}
          value={query}
          onChange={onQueryChange}
        />
        {loading && <span className="text-muted-foreground text-sm">Loading…</span>}
      </div>
      {tooShort && (
        <p className="text-muted-foreground mx-auto mt-2 max-w-6xl text-sm">
          Type at least 2 characters to search.
        </p>
      )}
    </div>
  )
}
