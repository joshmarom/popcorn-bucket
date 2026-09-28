export function releaseYearFromDate(releaseDate: string | null): number | null {
  if (!releaseDate || !/^\d{4}/.test(releaseDate)) return null
  const year = Number(releaseDate.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

export function formatRuntime(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  if (hours <= 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
