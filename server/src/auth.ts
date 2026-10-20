import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import type { Context, Next } from 'hono'
import * as schema from './auth-schema'
import { getDb, getPool } from './db'

export function createAuth(): ReturnType<typeof betterAuth> {
  const db = getDb()
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || 'https://popcorn.josh.co.il',
    secret: process.env.BETTER_AUTH_SECRET,
    basePath: '/v1/auth',
    emailAndPassword: { enabled: true, autoSignIn: true },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'user',
          input: false
        },
        disabledAt: {
          type: 'date',
          required: false,
          input: false
        }
      }
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const result = await getPool().query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "user"')
            const first = (result.rows[0]?.n ?? 0) === 0
            return { data: { ...user, role: first ? 'admin' : 'user' } }
          }
        }
      },
      session: {
        create: {
          before: async (session) => {
            const result = await getPool().query<{ disabled_at: Date | null }>(
              'SELECT disabled_at FROM "user" WHERE id = $1',
              [session.userId]
            )
            if (result.rows[0]?.disabled_at) return false
          }
        }
      }
    },
    plugins: [bearer()],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema
    })
  })
}

export type Auth = ReturnType<typeof createAuth>

export function requireSession(auth: Auth) {
  return async (c: Context, next: Next) => {
    let session: Awaited<ReturnType<Auth['api']['getSession']>>
    try {
      session = await auth.api.getSession({ headers: c.req.raw.headers })
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      return c.json({ ok: false, error: 'auth unavailable' }, 503)
    }
    if (!session) return c.json({ ok: false, error: 'Sign in required.' }, 401)
    const account = await getPool().query<{ disabled_at: Date | null }>(
      'SELECT disabled_at FROM "user" WHERE id = $1',
      [session.user.id]
    )
    if (!account.rows[0]) return c.json({ ok: false, error: 'Sign in required.' }, 401)
    if (account.rows[0].disabled_at) return c.json({ ok: false, error: 'Account disabled.' }, 403)
    c.set('userId', session.user.id)
    return next()
  }
}
