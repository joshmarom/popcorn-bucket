import './env'
import { DatabaseSync } from 'node:sqlite'
import pg from 'pg'
import { pgConfig } from './pg-config'

const [sqlitePath, email] = process.argv.slice(2)
if (!sqlitePath || !email) {
  console.error('usage: node dist/import-library.js <library.sqlite> <email>')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true })
const pool = new pg.Pool(pgConfig(databaseUrl))

try {
  const user = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email])
  const userId = user.rows[0]?.id
  if (!userId) {
    console.error('no account with that email. Sign up first, then rerun the import.')
    process.exit(1)
  }

  const movies = tableExists('list_items') ? movieWatchlist() : []
  const shows = tableExists('show_watchlist') ? showWatchlist() : []
  const progress = tableExists('watch_progress') ? movieProgress() : []

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const row of movies) await upsertWatchlist(client, userId, 'movie', row)
    for (const row of shows) await upsertWatchlist(client, userId, 'show', row)
    for (const row of progress) await upsertProgress(client, userId, row)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  console.log(`imported ${movies.length} movies, ${shows.length} shows, ${progress.length} progress rows`)
} finally {
  sqlite.close()
  await pool.end()
}

function tableExists(name: string): boolean {
  const row = sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name)
  return Boolean(row)
}

function movieWatchlist(): LibraryItem[] {
  return sqlite
    .prepare(
      `SELECT li.item_id AS tmdb_id, li.added_at
       FROM list_items li
       JOIN lists l ON l.id = li.list_id
       WHERE l.name = 'My list' AND li.kind = 'movie'`
    )
    .all() as LibraryItem[]
}

function showWatchlist(): LibraryItem[] {
  return sqlite
    .prepare('SELECT show_id AS tmdb_id, added_at FROM show_watchlist')
    .all() as LibraryItem[]
}

function movieProgress(): ProgressRow[] {
  return sqlite
    .prepare(
      `SELECT movie_id AS tmdb_id, position, duration, finished, updated_at
       FROM watch_progress`
    )
    .all() as ProgressRow[]
}

async function upsertWatchlist(
  client: pg.PoolClient,
  userId: string,
  mediaType: 'movie' | 'show',
  row: LibraryItem
): Promise<void> {
  await client.query(
    `INSERT INTO watchlist_items (user_id, media_type, tmdb_id, added_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, media_type, tmdb_id) DO UPDATE SET added_at = excluded.added_at`,
    [userId, mediaType, row.tmdb_id, row.added_at]
  )
}

async function upsertProgress(client: pg.PoolClient, userId: string, row: ProgressRow): Promise<void> {
  await client.query(
    `INSERT INTO watch_progress (
       user_id, media_type, tmdb_id, season, episode, position, duration, finished, updated_at
     ) VALUES ($1, 'movie', $2, NULL, NULL, $3, $4, $5, $6)
     ON CONFLICT (user_id, media_type, tmdb_id, (COALESCE(season, -1)), (COALESCE(episode, -1)))
     DO UPDATE SET
       position = excluded.position,
       duration = excluded.duration,
       finished = excluded.finished,
       updated_at = excluded.updated_at`,
    [userId, row.tmdb_id, row.position, row.duration, row.finished ? 1 : 0, row.updated_at]
  )
}

interface LibraryItem {
  tmdb_id: number
  added_at: number
}

interface ProgressRow {
  tmdb_id: number
  position: number
  duration: number
  finished: number
  updated_at: number
}
