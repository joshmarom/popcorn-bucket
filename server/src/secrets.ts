import type { AppSettings } from '../../src/shared/app-settings'
import { defaultAppSettings } from '../../src/shared/app-settings'
import { getLibrary } from '../../src/main/library/db'
import { decryptSecret, encryptSecret } from './crypto'

const KEYS = [
  'tmdbApiKey',
  'tmdbReadAccessToken',
  'omdbApiKey',
  'openSubtitlesApiKey',
  'torrentClawApiKey'
] as const

type SecretKey = (typeof KEYS)[number]

let cache: { at: number; settings: AppSettings } | null = null

export function invalidateSettingsCache(): void {
  cache = null
}

export function serverSettings(): AppSettings {
  if (cache && Date.now() - cache.at < 15_000) return cache.settings
  const settings: AppSettings = { ...defaultAppSettings }
  const rows = getLibrary()
    .prepare('SELECT key, value FROM app_secrets')
    .all() as { key: string; value: Buffer | Uint8Array }[]
  for (const row of rows) {
    if (!KEYS.includes(row.key as SecretKey)) continue
    const bytes = Buffer.isBuffer(row.value) ? row.value : Buffer.from(row.value)
    settings[row.key as SecretKey] = decryptSecret(bytes)
  }
  cache = { at: Date.now(), settings }
  return settings
}

export function setServerSecret(key: string, value: string): void {
  if (!KEYS.includes(key as SecretKey)) throw new Error(`Unknown secret: ${key}`)
  const payload = encryptSecret(value)
  getLibrary()
    .prepare(
      `INSERT INTO app_secrets (key, value, updated_at) VALUES (?, ?, now())
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`
    )
    .run(key, payload)
  invalidateSettingsCache()
}
