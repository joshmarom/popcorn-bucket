import { LOW_QUALITY_SOURCES, type ReleaseResolution } from './release-info'
import type { TorrentSource } from './torrent'

export type RankingPreferences = {
  /** Resolution the user wants; closer matches rank higher. */
  preferredResolution: ReleaseResolution
}

export const defaultRankingPreferences: RankingPreferences = {
  preferredResolution: '1080p'
}

export type RankingContext = {
  movieTitle: string
  movieYear: number | null
}

export type RankedTorrentSource = TorrentSource & { score: number }

const RESOLUTION_ORDER: ReleaseResolution[] = ['480p', '720p', '1080p', '2160p']

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to'])

function significantWords(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
}

/** True when the release name plausibly refers to this movie (title words present, year close). */
export function matchesMovie(row: TorrentSource, ctx: RankingContext): boolean {
  const wanted = significantWords(ctx.movieTitle)
  if (wanted.length > 0) {
    const have = new Set(significantWords(row.title))
    if (!wanted.every((w) => have.has(w))) return false
  }
  const year = row.release.year
  if (ctx.movieYear != null && year != null && Math.abs(year - ctx.movieYear) > 1) return false
  return true
}

function resolutionScore(res: ReleaseResolution | null, pref: ReleaseResolution): number {
  if (res == null) return 10
  const distance = RESOLUTION_ORDER.indexOf(res) - RESOLUTION_ORDER.indexOf(pref)
  if (distance === 0) return 40
  // Going one step above the preference is better than going below it.
  if (distance === 1) return 28
  if (distance === -1) return 22
  return distance > 0 ? 12 : 4
}

const SOURCE_SCORE: Record<string, number> = {
  bluray: 20,
  remux: 16,
  web: 18,
  hdtv: 8,
  dvd: 6
}

/** Very small files are samples or re-encodes; huge ones are slow to fetch for streaming. */
function sizeScore(bytes: number | null, res: ReleaseResolution | null): number {
  if (bytes == null) return 0
  const gb = bytes / 1024 ** 3
  if (gb < 0.3) return -30
  const ceiling = res === '2160p' ? 40 : 15
  if (gb > ceiling) return -15
  return 0
}

function seedScore(seeders: number): number {
  if (seeders <= 0) return -50
  return Math.min(30, Math.log2(seeders + 1) * 5)
}

export function scoreTorrentSource(row: TorrentSource, prefs: RankingPreferences): number {
  const r = row.release
  return (
    resolutionScore(r.resolution, prefs.preferredResolution) +
    (r.source ? (SOURCE_SCORE[r.source] ?? 0) : 5) +
    (r.codec === 'x265' || r.codec === 'av1' ? 3 : 0) +
    sizeScore(row.sizeBytes, r.resolution) +
    seedScore(row.seeders)
  )
}

export type RankedSources = {
  /** Watchable copies that match the movie, best first. */
  ranked: RankedTorrentSource[]
  /** Cam/telesync/screener copies and name mismatches, kept for the "other copies" list. */
  excluded: TorrentSource[]
}

export function rankTorrentSources(
  rows: TorrentSource[],
  ctx: RankingContext,
  prefs: RankingPreferences = defaultRankingPreferences
): RankedSources {
  const ranked: RankedTorrentSource[] = []
  const excluded: TorrentSource[] = []
  for (const row of rows) {
    const lowQuality = row.release.source != null && LOW_QUALITY_SOURCES.has(row.release.source)
    if (lowQuality || !matchesMovie(row, ctx) || !row.magnetUri) {
      excluded.push(row)
      continue
    }
    ranked.push({ ...row, score: scoreTorrentSource(row, prefs) })
  }
  ranked.sort((a, b) => b.score - a.score || b.seeders - a.seeders)
  return { ranked, excluded }
}
