import { lazy, Suspense, useState, type ReactElement } from 'react'
import type { MoviePlaybackDialogProps } from './movie-playback-dialog'

const MoviePlaybackDialog = lazy(() =>
  import('./movie-playback-dialog').then((mod) => ({ default: mod.MoviePlaybackDialog }))
)

/** Loads Vidstack only after inline playback opens, then keeps it for close animation. */
export function LazyMoviePlaybackDialog(props: MoviePlaybackDialogProps): ReactElement | null {
  const [mounted, setMounted] = useState(props.open)
  if (props.open && !mounted) setMounted(true)
  if (!mounted) return null
  return (
    <Suspense fallback={null}>
      <MoviePlaybackDialog {...props} />
    </Suspense>
  )
}
