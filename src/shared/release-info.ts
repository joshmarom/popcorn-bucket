export type ReleaseResolution = '2160p' | '1080p' | '720p' | '480p'

export type ReleaseSource =
  | 'remux'
  | 'bluray'
  | 'web'
  | 'hdtv'
  | 'dvd'
  | 'screener'
  | 'telesync'
  | 'cam'

export type ReleaseCodec = 'x265' | 'x264' | 'av1'

/** What we can tell about a release from its name. `null` means the name did not say. */
export type ReleaseInfo = {
  resolution: ReleaseResolution | null
  source: ReleaseSource | null
  codec: ReleaseCodec | null
  hdr: boolean
  year: number | null
}

/** Recorded-in-cinema copies; never offered as the default choice. */
export const LOW_QUALITY_SOURCES: ReadonlySet<ReleaseSource> = new Set([
  'cam',
  'telesync',
  'screener'
])

/** Separators in scene names (dots, underscores, brackets) become spaces for token matching. */
function tokenize(title: string): string {
  return ` ${title.toLowerCase().replace(/[._\-[\]()+{}]+/g, ' ')} `
}

function parseResolution(t: string): ReleaseResolution | null {
  if (/\s(2160p|4k|uhd)\s/.test(t)) return '2160p'
  if (/\s1080[pi]\s/.test(t)) return '1080p'
  if (/\s720p\s/.test(t)) return '720p'
  if (/\s(480p|576p|360p)\s/.test(t)) return '480p'
  return null
}

function parseSource(t: string): ReleaseSource | null {
  if (/\sremux\s/.test(t)) return 'remux'
  if (/\s(hd)?cam(rip)?\s/.test(t) || /\shqcam\s/.test(t)) return 'cam'
  if (/\s(hd)?(ts|telesync|tc|telecine)(rip)?\s/.test(t) || /\spdvd\s/.test(t)) return 'telesync'
  if (/\s(dvd)?scr(eener)?\s/.test(t) || /\sr5\s/.test(t)) return 'screener'
  if (/\s(blu ?ray|bdrip|brrip|bdremux|bd25|bd50|bd)\s/.test(t)) return 'bluray'
  if (/\s(web ?dl|web ?rip|web|amzn|nf|dsnp|hmax|atvp)\s/.test(t)) return 'web'
  if (/\s(hdtv|pdtv|dsr)\s/.test(t)) return 'hdtv'
  if (/\s(dvd ?rip|dvd ?r|dvd|dvd9|dvd5)\s/.test(t)) return 'dvd'
  return null
}

function parseCodec(t: string): ReleaseCodec | null {
  if (/\s(x265|h ?265|hevc)\s/.test(t)) return 'x265'
  if (/\sav1\s/.test(t)) return 'av1'
  if (/\s(x264|h ?264|avc)\s/.test(t)) return 'x264'
  return null
}

function parseYear(t: string): number | null {
  const years = [...t.matchAll(/\s((?:19|20)\d{2})\s/g)].map((m) => Number(m[1]))
  const now = new Date().getFullYear() + 1
  const plausible = years.filter((y) => y >= 1900 && y <= now)
  return plausible.length > 0 ? plausible[plausible.length - 1]! : null
}

export function parseReleaseTitle(title: string): ReleaseInfo {
  const t = tokenize(title)
  return {
    resolution: parseResolution(t),
    source: parseSource(t),
    codec: parseCodec(t),
    hdr: /\s(hdr|hdr10|dv|dovi|dolby vision)\s/.test(t),
    year: parseYear(t)
  }
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  kib: 1024,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  tb: 1024 ** 4,
  tib: 1024 ** 4
}

/** Parses indexer size strings such as `1.4 GB`, `700 MiB`, or `1,024.5 MB`. */
export function parseSizeBytes(size: string | null): number | null {
  if (!size) return null
  const m = /([\d][\d,]*(?:\.\d+)?)\s*([kmgt]i?b|b)\b/i.exec(size.trim())
  if (!m) return null
  const n = Number(m[1]!.replace(/,/g, ''))
  const unit = SIZE_UNITS[m[2]!.toLowerCase()]
  if (!Number.isFinite(n) || unit == null) return null
  return Math.round(n * unit)
}
