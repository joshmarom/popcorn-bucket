export type WatchProgress = {
  movieId: number
  /** Seconds into the movie where playback stopped. */
  position: number
  duration: number
  updatedAt: number
  /** Watched to (nearly) the end; not shown in "Continue watching". */
  finished: boolean
}

/** Past this fraction of the runtime, a movie counts as watched. */
export const FINISHED_FRACTION = 0.92

/** Positions under this many seconds are not worth resuming. */
export const MIN_RESUME_SECONDS = 60

export function resumePosition(p: WatchProgress | null | undefined): number {
  if (!p || p.finished || p.position < MIN_RESUME_SECONDS) return 0
  return p.position
}
