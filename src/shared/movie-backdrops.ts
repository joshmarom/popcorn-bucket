/** A TMDB backdrop still, already narrowed to fields the slideshow cares about. */
export type BackdropCandidate = {
  filePath: string
  /** Null means the still has no burned-in language text. */
  iso639: string | null
  voteAverage: number
  voteCount: number
  aspectRatio: number | null
  width: number | null
}

const MAX_BACKDROPS = 5
const MIN_WIDTH = 1000
const MIN_ASPECT = 1.5

function score(candidate: BackdropCandidate): number {
  return candidate.voteCount * 10 + candidate.voteAverage
}

function isWideEnough(candidate: BackdropCandidate): boolean {
  if (candidate.width != null && candidate.width < MIN_WIDTH) return false
  if (candidate.aspectRatio != null && candidate.aspectRatio < MIN_ASPECT) return false
  return true
}

/**
 * A short list of backdrop file paths for the movie page slideshow.
 * The movie's own backdrop leads, then language-neutral stills by popularity.
 * Localized stills are used only when that would otherwise leave a single image.
 */
export function pickBackdropPaths(
  primaryPath: string | null | undefined,
  candidates: readonly BackdropCandidate[]
): string[] {
  const usable = candidates.filter(isWideEnough)
  const byScore = (a: BackdropCandidate, b: BackdropCandidate): number => score(b) - score(a)
  const neutral = usable.filter((candidate) => candidate.iso639 == null).sort(byScore)
  const localized = usable.filter((candidate) => candidate.iso639 != null).sort(byScore)

  const paths: string[] = []
  const push = (path: string | null | undefined): void => {
    const trimmed = path?.trim()
    if (!trimmed || paths.includes(trimmed) || paths.length >= MAX_BACKDROPS) return
    paths.push(trimmed)
  }

  push(primaryPath)
  for (const candidate of neutral) push(candidate.filePath)
  if (paths.length < 2) {
    for (const candidate of localized) push(candidate.filePath)
  }
  return paths
}
