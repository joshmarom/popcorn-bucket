const DAY_MS = 24 * 60 * 60 * 1000
const YEAR_MS = 365.25 * DAY_MS

const WEIGHT_SWARM = 0.35
const WEIGHT_POPULARITY = 0.25
const WEIGHT_RATING = 0.25
const WEIGHT_RECENCY = 0.15

const SWARM_CAP_SEEDERS = 5000
const SWARM_HALF_LIFE_MS = 7 * DAY_MS
const POPULARITY_CAP = 1000
const RATING_PRIOR_VOTES = 200
const RATING_PRIOR_MEAN = 6.5
const RECENCY_SCALE_YEARS = 4
const UNKNOWN_RECENCY = 0.2
/** Movies with no seeded copy on record keep this share of their score. */
export const NO_TORRENT_EVIDENCE_FACTOR = 0.6

export type MovieScoreInput = {
  /** Best known seeder count, or null when no indexer has reported the movie. */
  seeders: number | null
  /** Epoch ms when `seeders` was observed. */
  seenAt: number | null
  popularity: number | null
  voteAverage: number | null
  voteCount: number | null
  /** `YYYY-MM-DD` or `YYYY`. */
  releaseDate: string | null
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function logShare(value: number, cap: number): number {
  return clamp01(Math.log10(1 + Math.max(0, value)) / Math.log10(1 + cap))
}

function releaseTime(releaseDate: string | null): number | null {
  if (!releaseDate) return null
  const trimmed = releaseDate.trim()
  const full = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null
  const year = /^\d{4}/.test(trimmed) ? trimmed.slice(0, 4) : null
  const t = Date.parse(full ?? (year ? `${year}-07-01` : ''))
  return Number.isFinite(t) ? t : null
}

export function swarmScore(seeders: number | null, seenAt: number | null, now: number): number {
  if (seeders == null || seeders <= 0) return 0
  const age = seenAt == null ? SWARM_HALF_LIFE_MS * 4 : Math.max(0, now - seenAt)
  return logShare(seeders, SWARM_CAP_SEEDERS) * 0.5 ** (age / SWARM_HALF_LIFE_MS)
}

export function popularityScore(popularity: number | null): number {
  return popularity == null ? 0 : logShare(popularity, POPULARITY_CAP)
}

/** Bayesian average, so a handful of perfect votes does not beat an established film. */
export function ratingScore(voteAverage: number | null, voteCount: number | null): number {
  const votes = Math.max(0, voteCount ?? 0)
  const average = voteAverage ?? RATING_PRIOR_MEAN
  const weighted =
    (votes / (votes + RATING_PRIOR_VOTES)) * average +
    (RATING_PRIOR_VOTES / (votes + RATING_PRIOR_VOTES)) * RATING_PRIOR_MEAN
  return clamp01(weighted / 10)
}

export function recencyScore(releaseDate: string | null, now: number): number {
  const t = releaseTime(releaseDate)
  if (t == null) return UNKNOWN_RECENCY
  if (t > now) return 0
  return clamp01(Math.exp(-(now - t) / YEAR_MS / RECENCY_SCALE_YEARS))
}

export function hasTorrentEvidence(input: Pick<MovieScoreInput, 'seeders'>): boolean {
  return input.seeders != null && input.seeders > 0
}

export function movieScore(input: MovieScoreInput, now: number): number {
  const total =
    WEIGHT_SWARM * swarmScore(input.seeders, input.seenAt, now) +
    WEIGHT_POPULARITY * popularityScore(input.popularity) +
    WEIGHT_RATING * ratingScore(input.voteAverage, input.voteCount) +
    WEIGHT_RECENCY * recencyScore(input.releaseDate, now)
  return hasTorrentEvidence(input) ? total : total * NO_TORRENT_EVIDENCE_FACTOR
}
