export const DETAILS_STALE_MS = 14 * 24 * 60 * 60 * 1000

export function isDetailsFresh(detailsAt: number | null | undefined, now = Date.now()): boolean {
  return detailsAt != null && detailsAt > 0 && now - detailsAt < DETAILS_STALE_MS
}
