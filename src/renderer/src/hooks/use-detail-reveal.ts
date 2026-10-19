import { useEffect, useState } from 'react'
import { useScreenTransition } from '@/lib/screen-transition'

/**
 * True once `poster`'s detail page may show its content. Content that is ready on arrival shows
 * at once; content that arrives later is swapped in through a view transition, so the shared
 * poster, title, and facts glide from the placeholder to their places.
 */
export function useDetailReveal(ready: boolean, poster: string): boolean {
  const { reveal } = useScreenTransition()
  const [revealedFor, setRevealedFor] = useState<string | null>(ready ? poster : null)
  useEffect(() => {
    if (!ready || revealedFor === poster) return
    return reveal(poster, () => setRevealedFor(poster))
  }, [ready, revealedFor, poster, reveal])
  return ready && revealedFor === poster
}
