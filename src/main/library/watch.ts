import { FINISHED_FRACTION, type WatchProgress } from '@shared/watch-history'
import type { LibraryDb } from './db'

export const MY_LIST = 'My list'

type ProgressRow = {
  movie_id: number
  position: number
  duration: number
  finished: number
  updated_at: number
}

function ensureList(db: LibraryDb, name: string): number {
  const existing = db.prepare('SELECT id FROM lists WHERE name = ?').get(name) as
    | { id: number }
    | undefined
  if (existing) return existing.id
  const inserted = db
    .prepare('INSERT INTO lists (name, created_at) VALUES (?, ?)')
    .run(name, Date.now())
  return Number(inserted.lastInsertRowid)
}

export function replaceMovieList(db: LibraryDb, name: string, movieIds: number[]): void {
  const listId = ensureList(db, name)
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM list_items WHERE list_id = ? AND kind = 'movie'`).run(listId)
    const insert = db.prepare(
      `INSERT INTO list_items (list_id, kind, item_id, position, added_at)
       VALUES (?, 'movie', ?, ?, ?)`
    )
    const addedAt = Date.now()
    movieIds.forEach((movieId, position) => {
      insert.run(listId, movieId, position, addedAt)
    })
  })
  run()
}

export function getWatchlist(db: LibraryDb): number[] {
  const list = db.prepare('SELECT id FROM lists WHERE name = ?').get(MY_LIST) as
    | { id: number }
    | undefined
  if (!list) return []
  const rows = db
    .prepare(
      `SELECT item_id FROM list_items
       WHERE list_id = ? AND kind = 'movie'
       ORDER BY position ASC`
    )
    .all(list.id) as { item_id: number }[]
  return rows.map((row) => row.item_id)
}

export function setInWatchlist(db: LibraryDb, movieId: number, inList: boolean): number[] {
  const next = getWatchlist(db).filter((id) => id !== movieId)
  if (inList) next.unshift(movieId)
  replaceMovieList(db, MY_LIST, next)
  return next
}

function toProgress(row: ProgressRow): WatchProgress {
  return {
    movieId: row.movie_id,
    position: row.position,
    duration: row.duration,
    updatedAt: row.updated_at,
    finished: row.finished === 1
  }
}

export function saveWatchProgress(db: LibraryDb, progress: WatchProgress): void {
  db.prepare(
    `INSERT INTO watch_progress (movie_id, position, duration, finished, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(movie_id) DO UPDATE SET
       position = excluded.position,
       duration = excluded.duration,
       finished = excluded.finished,
       updated_at = excluded.updated_at`
  ).run(
    progress.movieId,
    progress.position,
    progress.duration,
    progress.finished ? 1 : 0,
    progress.updatedAt
  )
}

export function recordWatchProgress(
  db: LibraryDb,
  movieId: number,
  position: number,
  duration: number
): void {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
  const finished = position / duration >= FINISHED_FRACTION
  saveWatchProgress(db, {
    movieId,
    position: finished ? 0 : Math.max(0, position),
    duration,
    updatedAt: Date.now(),
    finished
  })
}

export function getWatchProgress(db: LibraryDb, movieId: number): WatchProgress | null {
  const row = db.prepare('SELECT * FROM watch_progress WHERE movie_id = ?').get(movieId) as
    | ProgressRow
    | undefined
  return row ? toProgress(row) : null
}

export function listWatchProgress(db: LibraryDb): WatchProgress[] {
  const rows = db
    .prepare('SELECT * FROM watch_progress ORDER BY updated_at DESC')
    .all() as ProgressRow[]
  return rows.map(toProgress)
}

export function clearWatchProgress(db: LibraryDb, movieId: number): void {
  db.prepare('DELETE FROM watch_progress WHERE movie_id = ?').run(movieId)
}
