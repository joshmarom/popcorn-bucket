export type ShowStatus = 'new' | 'returning' | 'ended'

/** An episode that aired this recently makes the show "New episodes". */
export const NEW_EPISODE_WINDOW_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export function isEndedStatus(tmdbStatus: string | null | undefined): boolean {
  return tmdbStatus === 'Ended' || tmdbStatus === 'Canceled'
}

/** "2019–2024" for a finished run, "2022–" while still running, otherwise a single year. */
export function yearSpan(
  firstYear: number | null,
  lastYear: number | null,
  tmdbStatus: string | null
): string | null {
  if (firstYear == null) return null
  if (isEndedStatus(tmdbStatus)) {
    return lastYear != null && lastYear > firstYear ? `${firstYear}–${lastYear}` : String(firstYear)
  }
  if (tmdbStatus === 'Returning Series' || tmdbStatus === 'In Production') return `${firstYear}–`
  return String(firstYear)
}

export function showStatus(
  facts: { tmdbStatus: string | null; lastEpisodeAirDate: string | null },
  now = Date.now()
): ShowStatus | null {
  const aired = facts.lastEpisodeAirDate ? Date.parse(facts.lastEpisodeAirDate) : NaN
  if (Number.isFinite(aired) && aired <= now && now - aired <= NEW_EPISODE_WINDOW_DAYS * DAY_MS) {
    return 'new'
  }
  if (isEndedStatus(facts.tmdbStatus)) return 'ended'
  if (facts.tmdbStatus === 'Returning Series' || facts.tmdbStatus === 'In Production') {
    return 'returning'
  }
  return null
}

export const SHOW_STATUS_LABEL: Record<ShowStatus, string> = {
  new: 'New episodes',
  returning: 'Returning',
  ended: 'Ended'
}

export function seasonLabel(count: number | null): string | null {
  if (count == null || count < 1) return null
  return count === 1 ? '1 season' : `${count} seasons`
}
