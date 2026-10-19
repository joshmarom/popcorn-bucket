import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate, type To } from 'react-router-dom'

export type NavType = 'nav-forward' | 'nav-back' | 'nav-fade'

const SECTIONS = new Set(['/', '/library', '/tv', '/downloads', '/settings'])

type ViewTransitionHandle = { finished: Promise<void> }
type StartViewTransition = (update: {
  update: () => void
  types?: string[]
}) => ViewTransitionHandle

type ScreenTransitionValue = {
  poster: string | null
  /** The card that started the last poster transition, so copies of it elsewhere stay put. */
  source: string | null
  go: (to: To | number, poster?: string | null, state?: unknown, source?: string | null) => void
  /**
   * Swaps a detail page's placeholder for its content inside a view transition, after any
   * running one ends. Returns a cancel function.
   */
  reveal: (poster: string, update: () => void) => () => void
}

const ScreenTransitionContext = createContext<ScreenTransitionValue | null>(null)

/** Which list a card sits in. A movie can appear in several rails; only one copy may morph. */
export const CardScopeContext = createContext('page')

export function cardSourceKey(scope: string, href: string): string {
  return `${scope}|${pathOnly(href)}`
}

function pathOnly(value: string): string {
  const hash = value.startsWith('#') ? value.slice(1) : value
  const path = (hash.split('?')[0] ?? hash) || '/'
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

export function navType(fromPath: string, toPath: string): NavType {
  const from = pathOnly(fromPath)
  const to = pathOnly(toPath)
  if (from === to) return 'nav-fade'
  if (SECTIONS.has(from) && SECTIONS.has(to)) return 'nav-fade'
  if (SECTIONS.has(to) && !SECTIONS.has(from)) return 'nav-back'
  if (to !== '/' && from.startsWith(`${to}/`)) return 'nav-back'
  return 'nav-forward'
}

export function posterTransitionName(href: string): string | null {
  const path = pathOnly(href)
  const movie = path.match(/^\/movie\/(\d+)/)
  if (movie) return `poster-movie-${movie[1]}`
  const show = path.match(/^\/tv\/(\d+)/)
  if (show) return `poster-tv-${show[1]}`
  return null
}

export function posterStyle(name: string, active: string | null): CSSProperties | undefined {
  if (name !== active) return undefined
  return {
    viewTransitionName: name,
    viewTransitionClass: 'morph'
  } as CSSProperties
}

export function titleTransitionName(href: string): string | null {
  const poster = posterTransitionName(href)
  if (!poster?.startsWith('poster-')) return null
  return `title-${poster.slice('poster-'.length)}`
}

export function titleStyle(name: string, activePoster: string | null): CSSProperties | undefined {
  if (!activePoster?.startsWith('poster-')) return undefined
  const active = `title-${activePoster.slice('poster-'.length)}`
  if (name !== active) return undefined
  return {
    viewTransitionName: name,
    viewTransitionClass: 'morph'
  } as CSSProperties
}

/**
 * Shares a piece of a movie (its meta line, a genre) between the card and the detail page while
 * `owner`'s poster is the one travelling.
 */
export function partStyle(
  part: string,
  owner: string | null,
  activePoster: string | null
): CSSProperties | undefined {
  if (!owner || owner !== activePoster || !owner.startsWith('poster-')) return undefined
  return {
    viewTransitionName: `${part}-${owner.slice('poster-'.length)}`,
    viewTransitionClass: 'morph'
  } as CSSProperties
}

export function genrePart(genre: string): string {
  return `genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function routeFromAnchor(anchor: HTMLAnchorElement): string | null {
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return null
  const raw = anchor.getAttribute('href')
  if (!raw || raw.startsWith('mailto:') || raw.startsWith('javascript:')) return null
  if (raw.startsWith('#/')) return raw.slice(1)
  if (raw.startsWith('/')) return raw
  try {
    const url = new URL(raw, window.location.href)
    if (url.origin !== window.location.origin) return null
    if (url.hash.startsWith('#/')) return url.hash.slice(1)
  } catch {
    return null
  }
  return null
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function runViewTransition(
  update: () => void,
  type: NavType | 'detail-reveal'
): ViewTransitionHandle | null {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition
  if (!start || prefersReducedMotion()) {
    update()
    return null
  }
  return start.call(document, { update, types: [type] })
}

export function ScreenTransitionProvider({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
  const [poster, setPoster] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const active = useRef<ViewTransitionHandle | null>(null)

  const track = useCallback((transition: ViewTransitionHandle | null) => {
    active.current = transition
    if (!transition) {
      setPoster(null)
      return
    }
    void transition.finished.finally(() => {
      if (active.current === transition) active.current = null
      setPoster(null)
    })
  }, [])

  const go = useCallback(
    (to: To | number, nextPoster?: string | null, state?: unknown, nextSource?: string | null) => {
      const dest =
        typeof to === 'number'
          ? location.pathname
          : typeof to === 'string'
            ? to
            : (to.pathname ?? location.pathname)
      const type: NavType =
        typeof to === 'number'
          ? to < 0
            ? 'nav-back'
            : 'nav-forward'
          : navType(location.pathname, dest)
      const posterName = nextPoster || null
      if (posterName) {
        flushSync(() => {
          if (nextSource !== undefined) setSource(nextSource)
          setPoster(posterName)
        })
      }
      const transition = runViewTransition(() => {
        flushSync(() => {
          if (!posterName) setPoster(null)
          if (typeof to === 'number') navigate(to)
          else navigate(to, { state })
        })
      }, type)
      track(transition)
    },
    [location.pathname, navigate, track]
  )

  const reveal = useCallback(
    (posterName: string, update: () => void) => {
      let cancelled = false
      const run = (): void => {
        if (cancelled) return
        flushSync(() => setPoster(posterName))
        track(runViewTransition(() => flushSync(update), 'detail-reveal'))
      }
      const start = (): void => {
        if (!cancelled) frame = window.requestAnimationFrame(run)
      }
      let frame = 0
      const pending = active.current
      if (pending) void pending.finished.then(start, start)
      else start()
      return () => {
        cancelled = true
        window.cancelAnimationFrame(frame)
      }
    },
    [track]
  )

  const value = useMemo(() => ({ poster, source, go, reveal }), [poster, source, go, reveal])

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest('a')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const to = routeFromAnchor(anchor)
      if (!to) return
      event.preventDefault()
      event.stopPropagation()
      const queryAt = to.indexOf('?')
      const pathname = queryAt === -1 ? pathOnly(to) : pathOnly(to.slice(0, queryAt))
      const search = queryAt === -1 ? '' : to.slice(queryAt)
      const state: {
        vtPosterUrl?: string
        vtTitle?: string
        vtMeta?: string
        vtGenres?: string[]
        from?: string
      } = {}
      const posterUrl = anchor.getAttribute('data-vt-poster-url')
      const title = anchor.getAttribute('data-vt-title')
      const meta = anchor.getAttribute('data-vt-meta')
      const genres = anchor.getAttribute('data-vt-genres')
      const from = anchor.getAttribute('data-vt-from')
      if (posterUrl) state.vtPosterUrl = posterUrl
      if (title) state.vtTitle = title
      if (meta) state.vtMeta = meta
      if (genres) state.vtGenres = genres.split('|')
      if (from) state.from = from
      go(
        { pathname, search },
        anchor.getAttribute('data-vt-poster'),
        state,
        anchor.getAttribute('data-vt-source')
      )
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [go])

  return (
    <ScreenTransitionContext.Provider value={value}>{children}</ScreenTransitionContext.Provider>
  )
}

export function useScreenTransition(): ScreenTransitionValue {
  const value = useContext(ScreenTransitionContext)
  if (!value) throw new Error('useScreenTransition must be used inside ScreenTransitionProvider')
  return value
}
