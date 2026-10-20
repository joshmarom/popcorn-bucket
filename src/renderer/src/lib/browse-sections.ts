import { Film, Tv, type LucideIcon } from 'lucide-react'

export type BrowseSection = 'movies' | 'tv'

export const BROWSE_SECTIONS: Record<
  BrowseSection,
  { label: string; path: string; icon: LucideIcon; searchPlaceholder: string }
> = {
  movies: { label: 'Movies', path: '/', icon: Film, searchPlaceholder: 'Search movies…' },
  tv: { label: 'TV shows', path: '/tv', icon: Tv, searchPlaceholder: 'Search TV shows…' }
}

export const BROWSE_SECTION_ORDER: BrowseSection[] = ['movies', 'tv']

/** Which browse section a route belongs to, so detail and genre pages keep their section lit. */
export function browseSectionForPath(pathname: string): BrowseSection | null {
  if (pathname === '/tv' || pathname.startsWith('/tv/')) return 'tv'
  if (
    pathname === '/' ||
    pathname.startsWith('/movie/') ||
    pathname.startsWith('/genre/') ||
    pathname.startsWith('/collection/')
  ) {
    return 'movies'
  }
  return null
}
