import {
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'
import { cn } from '@/lib/utils'

/**
 * Page-list change: fade the current grid out, scroll the heading to the top
 * while it is hidden, then fade the next grid in. The new posters mount only
 * after the scroll, so Chromium loads the last row in its final place.
 *
 * `contentKey` identifies the grid on screen (item ids). While idle it tracks
 * the live grid; a page change freezes that grid for the fade-out.
 */
export function PageTurn({
  page,
  items,
  scrollTarget,
  children
}: {
  page: number
  items: readonly { id: number }[]
  scrollTarget: RefObject<HTMLElement | null>
  children: ReactNode
}): ReactElement {
  const contentKey = pageTurnKey(items)
  const [trackedPage, setTrackedPage] = useState(page)
  const [held, setHeld] = useState(children)
  const [heldKey, setHeldKey] = useState(contentKey)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const skipReducedScroll = useRef(true)

  if (trackedPage !== page) {
    setTrackedPage(page)
    if (!prefersReducedMotion() && phase !== 'out') setPhase('out')
  } else if (phase === 'idle' && heldKey !== contentKey) {
    setHeld(children)
    setHeldKey(contentKey)
  }

  useLayoutEffect(() => {
    if (skipReducedScroll.current) {
      skipReducedScroll.current = false
      return
    }
    if (!prefersReducedMotion()) return
    scrollTarget.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [page, scrollTarget])

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (phase === 'out' && event.animationName === 't-page-turn-out') {
      const target = scrollTarget.current
      const reveal = (): void => {
        setHeld(children)
        setHeldKey(contentKey)
        setPhase('in')
      }
      if (!target) {
        reveal()
        return
      }
      void scrollToHeading(target).then(reveal)
    } else if (phase === 'in' && event.animationName === 't-page-turn-in') {
      setPhase('idle')
    }
  }

  return (
    <div
      className={cn('t-page-turn', phase === 'out' && 'is-out', phase === 'in' && 'is-in')}
      onAnimationEnd={onAnimationEnd}
    >
      {phase === 'idle' ? children : held}
    </div>
  )
}

function pageTurnKey(items: readonly { id: number }[]): string {
  let key = ''
  for (const item of items) key += `${item.id},`
  return key
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement
  while (current) {
    const overflow = getComputedStyle(current).overflowY
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return current
    current = current.parentElement
  }
  return null
}

const SCROLL_MS = 240

function scrollToHeading(el: HTMLElement): Promise<void> {
  const scroller = scrollParent(el)
  if (!scroller || prefersReducedMotion()) {
    el.scrollIntoView({ block: 'start', behavior: 'instant' })
    return Promise.resolve()
  }
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  const top =
    scroller.scrollTop +
    (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) -
    margin
  const start = scroller.scrollTop
  const delta = top - start
  if (Math.abs(delta) < 1) return Promise.resolve()
  // A fixed short scroll, not the browser's distance-based smooth scroll,
  // so the hidden grid is only blank for a moment. Posters mount when it ends.
  return new Promise((resolve) => {
    const started = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - started) / SCROLL_MS)
      scroller.scrollTop = start + delta * easeSmoothOut(t)
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

/** cubic-bezier(0.22, 1, 0.36, 1) */
function easeSmoothOut(t: number): number {
  const sampleX = (u: number): number => ((0.58 * u - 0.24) * u + 0.66) * u
  const sampleY = (u: number): number => (u - 3) * u * u + 3 * u
  let u = t
  for (let i = 0; i < 5; i++) {
    const slope = (1.74 * u - 0.48) * u + 0.66
    if (Math.abs(slope) < 1e-4) break
    u -= (sampleX(u) - t) / slope
  }
  return sampleY(Math.min(1, Math.max(0, u)))
}
