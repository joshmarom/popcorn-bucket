export function releaseYearFromDate(releaseDate: string | null): number | null {
  if (!releaseDate || !/^\d{4}/.test(releaseDate)) return null
  const year = Number(releaseDate.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

/** "2024 · 2h 10m", the same line the poster cards show. */
export function movieBasics(releaseDate: string | null, runtime: number | null): string {
  const year = releaseYearFromDate(releaseDate)
  return [
    year != null ? String(year) : null,
    runtime != null && runtime > 0 ? formatRuntime(runtime) : null
  ]
    .filter(Boolean)
    .join(' · ')
}

export function formatRuntime(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  if (hours <= 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
