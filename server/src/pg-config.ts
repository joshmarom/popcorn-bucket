import type { ClientConfig } from 'pg'

/** Hetzner's managed Postgres presents a certificate Node does not trust by default. */
export function pgConfig(connectionString: string): ClientConfig {
  const url = new URL(connectionString)
  url.searchParams.delete('sslmode')
  url.searchParams.delete('ssl')
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false }
  }
}
