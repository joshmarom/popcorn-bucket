/**
 * Rewrites the desktop library's better-sqlite3 SQL so it can run on Postgres.
 * The desktop sources stay unchanged.
 */
export function toPostgres(
  sql: string,
  args: unknown[]
): { text: string; params: unknown[] } {
  let text = sql
  const ignore = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(text)
  text = text.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
  if (ignore && !/ON\s+CONFLICT/i.test(text)) {
    text = `${text.trimEnd()} ON CONFLICT DO NOTHING`
  }
  text = text.replace(/ON\s+CONFLICT\s*\(/gi, 'ON CONFLICT (')
  // SQLite accepts a bare column in these grouped selects. Postgres does not.
  text = text.replace(
    /MAX\(seeders\) AS seeders,\s*fetched_at\b/gi,
    'MAX(seeders) AS seeders, MAX(fetched_at) AS fetched_at'
  )
  text = text.replace(
    /MAX\(t\.seeders\) AS seeders,\s*t\.fetched_at AS fetched_at/gi,
    'MAX(t.seeders) AS seeders, MAX(t.fetched_at) AS fetched_at'
  )

  const named =
    args.length === 1 &&
    args[0] !== null &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0]) &&
    !Buffer.isBuffer(args[0]) &&
    /@[A-Za-z_]/.test(text)

  if (named) {
    const row = args[0] as Record<string, unknown>
    const params: unknown[] = []
    text = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
      params.push(row[name])
      return `$${params.length}`
    })
    return { text, params }
  }

  let index = 0
  text = text.replace(/\?/g, () => {
    index += 1
    return `$${index}`
  })
  return { text, params: args }
}
