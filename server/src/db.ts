import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './auth-schema'
import { pgConfig } from './pg-config'

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  if (!pool) pool = new pg.Pool(pgConfig(databaseUrl))
  return pool
}

export function getDb() {
  return drizzle(getPool(), { schema })
}
