import { useEffect, useRef, type RefObject } from 'react'

/**
 * Brings `target` to the top of the scroll area whenever `page` changes (not on first render).
 * The app scrolls inside `<main>`, so `window.scrollTo` has no effect; give the target a
 * `scroll-mt-*` class to clear sticky headers.
 */
export function useScrollToOnPageChange(target: RefObject<HTMLElement | null>, page: number): void {
  const previous = useRef(page)
  useEffect(() => {
    if (previous.current === page) return
    previous.current = page
    target.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [page, target])
}
