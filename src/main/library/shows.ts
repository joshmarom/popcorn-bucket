import { movieScore } from '@shared/movie-score'
import type { TvShowListItem } from '@shared/tv'
import type { LibraryDb } from './db'
import { RANK_POOL_WINDOW_MS, pickSwarmEvidence, type TrendingSwarmRow } from './ranked-lists'

/** One row from a TMDB TV list endpoint (popular, search, find). */
export type LibraryShowListRow = {
  tmdbId: number
  name: string
  firstAirDate: string | null
  overview: string
  posterUrl: string | null
  voteAverage: number | null
  voteCount: number | null
  popularity: number | null
  imdbId?: string | null
}

export type LibraryShowDetails = {
  tmdbId: number
  name: string
  firstAirDate: string | null
  overview: string
  posterUrl: string | null
  imdbId: string | null
  voteAverage: number | null
  voteCount: number | null
  popularity: number | null
}

type ShowPoolRow = {
  tmdb_id: number
  name: string
  year: number | null
  first_air_date: string | null
  overview: string
  poster_url: string | null
  rating: number | null
  vote_count: number | null
  tmdb_popularity: number | null
  swarm_seeders: number | null
  swarm_seen_at: number | null
  swarm_upload_unix: number | null
  copy_seeders: number | null
  copy_seen_at: number | null
}

function airYear(date: string | null): number | null {
  if (!date || !/^\d{4}/.test(date)) return null
  const year = Number(date.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

function storedImdbId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return /^tt\d+$/i.test(trimmed) ? trimmed.toLowerCase() : null
}

/** Records TMDB list rows without overwriting what the show page saved. */
export function upsertShowListRows(
  db: LibraryDb,
  rows: LibraryShowListRow[],
  seenAt = Date.now()
): void {
  const upsert = db.prepare(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, year, imdb_id, overview, poster_url,
       rating, vote_count, tmdb_popularity, list_seen_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       name = excluded.name,
       first_air_date = COALESCE(excluded.first_air_date, shows.first_air_date),
       year = COALESCE(excluded.year, shows.year),
       imdb_id = COALESCE(shows.imdb_id, excluded.imdb_id),
       overview = CASE WHEN shows.overview = '' THEN excluded.overview ELSE shows.overview END,
       poster_url = COALESCE(shows.poster_url, excluded.poster_url),
       rating = COALESCE(excluded.rating, shows.rating),
       vote_count = COALESCE(excluded.vote_count, shows.vote_count),
       tmdb_popularity = COALESCE(excluded.tmdb_popularity, shows.tmdb_popularity),
       list_seen_at = excluded.list_seen_at`
  )
  const run = db.transaction(() => {
    for (const row of rows) {
      upsert.run(
        row.tmdbId,
        row.name,
        row.firstAirDate,
        airYear(row.firstAirDate),
        storedImdbId(row.imdbId),
        row.overview,
        row.posterUrl,
        row.voteAverage,
        row.voteCount,
        row.popularity,
        seenAt,
        seenAt
      )
    }
  })
  run()
}

export function upsertShowDetails(db: LibraryDb, show: LibraryShowDetails): void {
  db.prepare(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, year, imdb_id, overview, poster_url,
       rating, vote_count, tmdb_popularity, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       name = excluded.name,
       first_air_date = COALESCE(excluded.first_air_date, shows.first_air_date),
       year = COALESCE(excluded.year, shows.year),
       imdb_id = COALESCE(excluded.imdb_id, shows.imdb_id),
       overview = excluded.overview,
       poster_url = COALESCE(excluded.poster_url, shows.poster_url),
       rating = COALESCE(excluded.rating, shows.rating),
       vote_count = COALESCE(excluded.vote_count, shows.vote_count),
       tmdb_popularity = COALESCE(excluded.tmdb_popularity, shows.tmdb_popularity),
       updated_at = excluded.updated_at`
  ).run(
    show.tmdbId,
    show.name,
    show.firstAirDate,
    airYear(show.firstAirDate),
    storedImdbId(show.imdbId),
    show.overview,
    show.posterUrl,
    show.voteAverage,
    show.voteCount,
    show.popularity,
    Date.now()
  )
}

export function recordShowSwarm(
  db: LibraryDb,
  rows: TrendingSwarmRow[],
  seenAt = Date.now()
): void {
  const upsert = db.prepare(
    `INSERT INTO show_swarm (tmdb_id, seeders, peers, latest_upload_unix, seen_at)
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shows WHERE tmdb_id = ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       seeders = excluded.seeders,
       peers = excluded.peers,
       latest_upload_unix = excluded.latest_upload_unix,
       seen_at = excluded.seen_at`
  )
  const run = db.transaction(() => {
    for (const row of rows) {
      upsert.run(row.tmdbId, row.seeders, row.peers, row.latestUploadUnix, seenAt, row.tmdbId)
    }
  })
  run()
}

/**
 * Episode searches are cached under the show's IMDb id (`tt…::Show S01E02`), so the best
 * non-cam copy across those searches counts as torrent evidence for the show.
 */
function loadShowPool(db: LibraryDb, cutoff: number): ShowPoolRow[] {
  return db
    .prepare(
      `WITH copies AS (
         SELECT s.tmdb_id AS show_id, MAX(t.seeders) AS seeders, t.fetched_at AS fetched_at
         FROM shows s
         JOIN torrent_search_hits h
           ON h.cache_key >= s.imdb_id || '::' AND h.cache_key < s.imdb_id || ':;'
         JOIN torrents t ON t.info_hash = h.info_hash
         WHERE s.imdb_id IS NOT NULL
           AND (t.source IS NULL OR t.source NOT IN ('cam', 'telesync', 'screener'))
         GROUP BY s.tmdb_id
       )
       SELECT s.tmdb_id, s.name, s.year, s.first_air_date, s.overview, s.poster_url,
              s.rating, s.vote_count, s.tmdb_popularity,
              w.seeders AS swarm_seeders, w.seen_at AS swarm_seen_at,
              w.latest_upload_unix AS swarm_upload_unix,
              c.seeders AS copy_seeders, c.fetched_at AS copy_seen_at
       FROM shows s
       LEFT JOIN show_swarm w ON w.tmdb_id = s.tmdb_id
       LEFT JOIN copies c ON c.show_id = s.tmdb_id
       WHERE s.list_seen_at >= @cutoff OR w.seen_at >= @cutoff OR c.fetched_at >= @cutoff`
    )
    .all({ cutoff }) as ShowPoolRow[]
}

/** A long-running show with a new season is recent: use the newest upload when it beats the premiere. */
function recencyDate(row: ShowPoolRow): string | null {
  const premiere = row.first_air_date ?? (row.year ? String(row.year) : null)
  const upload = row.swarm_upload_unix
  if (!upload || upload <= 0) return premiere
  const uploadDate = new Date(upload * 1000).toISOString().slice(0, 10)
  return premiere == null || uploadDate > premiere ? uploadDate : premiere
}

export function rankShows(db: LibraryDb, opts: { limit: number; now?: number }): TvShowListItem[] {
  const now = opts.now ?? Date.now()
  const scored = loadShowPool(db, now - RANK_POOL_WINDOW_MS).map((row) => {
    const evidence = pickSwarmEvidence(
      { seeders: row.swarm_seeders, seenAt: row.swarm_seen_at },
      { seeders: row.copy_seeders, seenAt: row.copy_seen_at },
      now
    )
    const score = movieScore(
      {
        seeders: evidence.seeders,
        seenAt: evidence.seenAt,
        popularity: row.tmdb_popularity,
        voteAverage: row.rating,
        voteCount: row.vote_count,
        releaseDate: recencyDate(row)
      },
      now
    )
    return { row, score }
  })
  scored.sort((a, b) => b.score - a.score || a.row.tmdb_id - b.row.tmdb_id)
  return scored.slice(0, opts.limit).map(({ row }) => ({
    id: row.tmdb_id,
    name: row.name,
    firstAirYear: row.year,
    posterUrl: row.poster_url,
    overview: row.overview,
    voteAverage: row.rating
  }))
}
