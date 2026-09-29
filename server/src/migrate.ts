import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { pgConfig } from './pg-config'

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const besideOutput = join(here, '..', 'drizzle')
  if (existsSync(besideOutput)) return besideOutput
  return join(here, 'drizzle')
}

/** Splits a script on semicolons, keeping dollar-quoted function bodies intact. */
export function splitSql(sql: string): string[] {
  const parts: string[] = []
  let current = ''
  let i = 0
  let quote: string | null = null
  while (i < sql.length) {
    if (!quote && sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i)
      i = end === -1 ? sql.length : end + 1
      continue
    }
    if (!quote && sql.startsWith('$$', i)) {
      quote = '$$'
      current += '$$'
      i += 2
      continue
    }
    if (quote === '$$' && sql.startsWith('$$', i)) {
      quote = null
      current += '$$'
      i += 2
      continue
    }
    if (!quote && sql[i] === ';') {
      const statement = current.trim()
      if (statement) parts.push(statement)
      current = ''
      i += 1
      continue
    }
    current += sql[i]
    i += 1
  }
  const tail = current.trim()
  if (tail) parts.push(tail)
  return parts
}

const dir = migrationsDir()

export async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const client = new pg.Client(pgConfig(connectionString))
  await client.connect()
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    )
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const file of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file])
      if (done.rowCount) continue
      const statements = splitSql(readFileSync(join(dir, file), 'utf8'))
      await client.query('BEGIN')
      try {
        for (const statement of statements) await client.query(statement)
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith('migrate.js')) {
  migrate().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
