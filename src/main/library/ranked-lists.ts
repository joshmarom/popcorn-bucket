import type { CatalogMovieListItem } from '@shared/catalog'
import { movieScore, swarmScore } from '@shared/movie-score'
import type { LibraryDb } from './db'

const DAY_MS = 24 * 60 * 60 * 1000
export const RANK_POOL_WINDOW_MS = 30 * DAY_MS

export type TrendingSwarmRow = {
  tmdbId: number
  seeders: number
  peers: number
  latestUploadUnix: number
}

type PoolRow = {
  tmdb_id: number
  title: string
  year: number | null
  release_date: string | null
  overview: string
  poster_url: string | null
  rating: number | null
  vote_count: number | null
  tmdb_popularity: number | null
  swarm_seeders: number | null
  swarm_seen_at: number | null
  copy_seeders: number | null
  copy_seen_at: number | null
}

export function recordTrendingSwarm(
  db: LibraryDb,
  rows: TrendingSwarmRow[],
  seenAt = Date.now()
): void {
  const upsert = db.prepare(
    `INSERT INTO movie_swarm (tmdb_id, seeders, peers, latest_upload_unix, seen_at)
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM movies WHERE tmdb_id = ?)
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

/** Candidates seen in a TMDB list, an indexer list, or a torrent search in the last 30 days. */
function loadPool(db: LibraryDb, genreId: number | undefined, cutoff: number): PoolRow[] {
  const genreFilter =
    genreId == null
      ? ''
      : 'AND EXISTS (SELECT 1 FROM movie_genres g WHERE g.movie_id = m.tmdb_id AND g.genre_id = @genreId)'
  return db
    .prepare(
      `WITH copies AS (
         SELECT movie_id, MAX(seeders) AS seeders, fetched_at
         FROM torrents
         WHERE movie_id IS NOT NULL
           AND (source IS NULL OR source NOT IN ('cam', 'telesync', 'screener'))
         GROUP BY movie_id
       )
       SELECT m.tmdb_id, m.title, m.year, m.release_date, m.overview, m.poster_url,
              m.rating, m.vote_count, m.tmdb_popularity,
              s.seeders AS swarm_seeders, s.seen_at AS swarm_seen_at,
              c.seeders AS copy_seeders, c.fetched_at AS copy_seen_at
       FROM movies m
       LEFT JOIN movie_swarm s ON s.tmdb_id = m.tmdb_id
       LEFT JOIN copies c ON c.movie_id = m.tmdb_id
       WHERE (m.list_seen_at >= @cutoff OR s.seen_at >= @cutoff OR c.fetched_at >= @cutoff)
       ${genreFilter}`
    )
    .all(genreId == null ? { cutoff } : { cutoff, genreId }) as PoolRow[]
}

export type SwarmEvidence = { seeders: number | null; seenAt: number | null }

/** Picks whichever swarm observation counts for more after decay. */
export function pickSwarmEvidence(
  swarm: SwarmEvidence,
  copy: SwarmEvidence,
  now: number
): SwarmEvidence {
  return swarmScore(copy.seeders, copy.seenAt, now) > swarmScore(swarm.seeders, swarm.seenAt, now)
    ? copy
    : swarm.seeders != null
      ? swarm
      : copy
}

function toListItem(row: PoolRow): CatalogMovieListItem {
  const releaseDate =
    row.release_date && /^\d{4}-\d{2}-\d{2}$/.test(row.release_date) ? row.release_date : null
  return {
    id: row.tmdb_id,
    title: row.title,
    releaseDate,
    releaseYear: row.year,
    voteAverage: row.rating,
    popularity: row.tmdb_popularity,
    posterUrl: row.poster_url,
    overview: row.overview
  }
}

export function rankMovies(
  db: LibraryDb,
  opts: { genreId?: number; limit: number; now?: number }
): CatalogMovieListItem[] {
  const now = opts.now ?? Date.now()
  const scored = loadPool(db, opts.genreId, now - RANK_POOL_WINDOW_MS).map((row) => {
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
        releaseDate: row.release_date ?? (row.year ? String(row.year) : null)
      },
      now
    )
    return { row, score }
  })
  scored.sort((a, b) => b.score - a.score || a.row.tmdb_id - b.row.tmdb_id)
  return scored.slice(0, opts.limit).map(({ row }) => toListItem(row))
}
