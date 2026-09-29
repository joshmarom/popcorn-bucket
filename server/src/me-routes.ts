import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import { getPool } from './db'

const mediaType = z.enum(['movie', 'show'])

const watchlistBody = z.object({
  mediaType,
  tmdbId: z.number().int().positive(),
  inList: z.boolean()
})

const historyBody = z.object({
  mediaType,
  tmdbId: z.number().int().positive(),
  season: z.number().int().nonnegative().nullable().optional(),
  episode: z.number().int().nonnegative().nullable().optional(),
  position: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  finished: z.boolean()
})

const historyDelete = z.object({
  mediaType,
  tmdbId: z.number().int().positive(),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().nonnegative().optional()
})

export function registerMeRoutes(app: Hono): void {
  app.get('/v1/me', async (c) => {
    const userId = currentUser(c)
    const result = await getPool().query<{ id: string; email: string; name: string; role: string }>(
      'SELECT id, email, name, role FROM "user" WHERE id = $1',
      [userId]
    )
    const row = result.rows[0]
    if (!row) return c.json({ ok: false, error: 'Sign in required.' }, 401)
    return c.json({ ok: true, id: row.id, email: row.email, name: row.name, role: row.role })
  })

  app.get('/v1/me/watchlist', async (c) => {
    const rows = await getPool().query<{ media_type: 'movie' | 'show'; tmdb_id: number }>(
      `SELECT media_type, tmdb_id FROM watchlist_items
       WHERE user_id = $1
       ORDER BY added_at DESC, tmdb_id DESC`,
      [currentUser(c)]
    )
    return c.json({
      ok: true,
      movies: rows.rows.filter((row) => row.media_type === 'movie').map((row) => row.tmdb_id),
      shows: rows.rows.filter((row) => row.media_type === 'show').map((row) => row.tmdb_id)
    })
  })

  app.put('/v1/me/watchlist', async (c) => {
    const parsed = watchlistBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid watchlist update.' }, 400)
    const userId = currentUser(c)
    const { mediaType: kind, tmdbId, inList } = parsed.data
    if (inList) {
      await getPool().query(
        `INSERT INTO watchlist_items (user_id, media_type, tmdb_id, added_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, media_type, tmdb_id) DO UPDATE SET added_at = excluded.added_at`,
        [userId, kind, tmdbId, Date.now()]
      )
    } else {
      await getPool().query(
        'DELETE FROM watchlist_items WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3',
        [userId, kind, tmdbId]
      )
    }
    return c.json({ ok: true })
  })

  app.get('/v1/me/history', async (c) => {
    const rows = await getPool().query<{
      media_type: 'movie' | 'show'
      tmdb_id: number
      season: number | null
      episode: number | null
      position: number
      duration: number
      finished: number
      updated_at: string
    }>(
      `SELECT media_type, tmdb_id, season, episode, position, duration, finished, updated_at
       FROM watch_progress
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [currentUser(c)]
    )
    return c.json({
      ok: true,
      items: rows.rows.map((row) => ({
        mediaType: row.media_type,
        tmdbId: row.tmdb_id,
        season: row.season,
        episode: row.episode,
        position: row.position,
        duration: row.duration,
        finished: row.finished === 1,
        updatedAt: Number(row.updated_at)
      }))
    })
  })

  app.post('/v1/me/history', async (c) => {
    const parsed = historyBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid watch progress.' }, 400)
    const { mediaType: kind, tmdbId, season, episode, position, duration, finished } = parsed.data
    await getPool().query(
      `INSERT INTO watch_progress (
         user_id, media_type, tmdb_id, season, episode, position, duration, finished, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, media_type, tmdb_id, (COALESCE(season, -1)), (COALESCE(episode, -1)))
       DO UPDATE SET
         position = excluded.position,
         duration = excluded.duration,
         finished = excluded.finished,
         updated_at = excluded.updated_at`,
      [
        currentUser(c),
        kind,
        tmdbId,
        season ?? null,
        episode ?? null,
        position,
        duration,
        finished ? 1 : 0,
        Date.now()
      ]
    )
    return c.json({ ok: true })
  })

  app.delete('/v1/me/history', async (c) => {
    const parsed = historyDelete.safeParse({
      mediaType: c.req.query('mediaType'),
      tmdbId: Number(c.req.query('tmdbId')),
      season: optionalInt(c.req.query('season')),
      episode: optionalInt(c.req.query('episode'))
    })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid watch progress.' }, 400)
    const { mediaType: kind, tmdbId, season, episode } = parsed.data
    await getPool().query(
      `DELETE FROM watch_progress
       WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3
         AND COALESCE(season, -1) = COALESCE($4::int, -1)
         AND COALESCE(episode, -1) = COALESCE($5::int, -1)`,
      [currentUser(c), kind, tmdbId, season ?? null, episode ?? null]
    )
    return c.json({ ok: true })
  })
}

function optionalInt(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined
  return Number(value)
}

function currentUser(c: Context): string {
  const userId = c.get('userId')
  if (typeof userId !== 'string' || !userId) throw new Error('missing user')
  return userId
}
