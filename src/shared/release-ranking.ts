import { LOW_QUALITY_SOURCES, type ReleaseResolution } from './release-info'
import type { TorrentSource } from './torrent'

export type RankingPreferences = {
  /** Resolution the user wants; closer matches rank higher. */
  preferredResolution: ReleaseResolution
  /** ISO 639-1 code; copies with a matching subtitle or audio track get a small bonus. */
  preferredLanguage?: string
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

/** Words that may follow a movie title in a release name without making it a different title. */
const AFTER_TITLE_OK =
  /^((19|20)\d{2}|\d{3,4}p|4k|uhd|hdr|bluray|blu|brrip|bdrip|bdremux|remux|web|webrip|webdl|dl|hdrip|dvdrip|dvd|hdtv|x264|x265|h264|h265|hevc|avc|av1|remastered|extended|uncut|unrated|directors|imax|proper|repack|multi|dual|complete|yify|yts|s\d{1,2}(e\d{1,3})*|\d{1,2}x\d{2,3}|season)$/

/**
 * True when the release name refers to this movie: the title's words appear in order and are
 * followed by a year, a quality marker, or the end of the name (so "Matrix Reloaded" is not
 * "Matrix"), and any year is within one of the movie's.
 */
export function matchesMovie(row: TorrentSource, ctx: RankingContext): boolean {
  const wanted = significantWords(ctx.movieTitle)
  if (wanted.length > 0) {
    const words = significantWords(row.title)
    let matched = false
    for (let i = 0; i + wanted.length <= words.length && !matched; i++) {
      if (!wanted.every((w, j) => words[i + j] === w)) continue
      const next = words[i + wanted.length]
      matched = next === undefined || AFTER_TITLE_OK.test(next)
    }
    if (!matched) return false
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
  return Math.min(40, Math.log2(seeders + 1) * 5)
}

function baseLang(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/** TorrentClaw's score, verified file scans, and a track in the user's language. */
function qualityInfoScore(row: TorrentSource, prefs: RankingPreferences): number {
  const q = row.quality
  if (!q) return 0
  let score = q.score != null ? (Math.max(0, Math.min(100, q.score)) - 50) * 0.3 : 0
  if (q.verified) score += 5
  const lang = baseLang(prefs.preferredLanguage)
  if (lang) {
    const langs = [...q.subtitleLangs, ...q.audioTracks.map((a) => a.lang)].map(baseLang)
    if (langs.includes(lang)) score += 4
  }
  return score
}

export function scoreTorrentSource(row: TorrentSource, prefs: RankingPreferences): number {
  const r = row.release
  return (
    resolutionScore(r.resolution, prefs.preferredResolution) +
    (r.source ? (SOURCE_SCORE[r.source] ?? 0) : 5) +
    (r.codec === 'x265' || r.codec === 'av1' ? 3 : 0) +
    sizeScore(row.sizeBytes, r.resolution) +
    seedScore(row.seeders) +
    qualityInfoScore(row, prefs)
  )
}

export type EpisodeRankingContext = {
  showName: string
  season: number
  episode: number
}

/** The exact episode, or a pack of its whole season (only that episode's file is fetched). */
export function matchesEpisode(row: TorrentSource, ctx: EpisodeRankingContext): boolean {
  if (!matchesMovie(row, { movieTitle: ctx.showName, movieYear: null })) return false
  const r = row.release
  if (r.season !== ctx.season) return false
  return r.seasonPack || r.episode === ctx.episode
}

export function rankEpisodeSources(
  rows: TorrentSource[],
  ctx: EpisodeRankingContext,
  prefs: RankingPreferences = defaultRankingPreferences
): RankedSources {
  const ranked: RankedTorrentSource[] = []
  const excluded: TorrentSource[] = []
  for (const row of rows) {
    const lowQuality = row.release.source != null && LOW_QUALITY_SOURCES.has(row.release.source)
    if (lowQuality || !row.magnetUri || !matchesEpisode(row, ctx)) {
      excluded.push(row)
      continue
    }
    // Packs are large on paper but only one file is downloaded, so size does not count.
    const base = scoreTorrentSource(
      row.release.seasonPack ? { ...row, sizeBytes: null } : row,
      prefs
    )
    ranked.push({ ...row, score: base + (row.release.seasonPack ? 0 : 10) })
  }
  ranked.sort((a, b) => b.score - a.score || b.seeders - a.seeders)
  return { ranked, excluded }
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
