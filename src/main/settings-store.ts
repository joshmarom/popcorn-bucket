import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import * as ElectronStoreModule from 'electron-store'
import { app, safeStorage } from 'electron'
import { defaultAppSettings, type AppSettings } from '@shared/app-settings'

type StoreCtor = typeof import('electron-store').default

/**
 * electron-store v11 is ESM-only. The main bundle uses `require()`, which yields
 * `{ default: Store }`; Vite's namespace helper then puts that object on `.default` again.
 */
function getStoreConstructor(): StoreCtor {
  const exported = (ElectronStoreModule as { default?: unknown }).default
  if (typeof exported === 'function') {
    return exported as StoreCtor
  }
  if (
    exported !== null &&
    typeof exported === 'object' &&
    'default' in exported &&
    typeof (exported as { default: unknown }).default === 'function'
  ) {
    return (exported as { default: StoreCtor }).default
  }
  throw new Error('Could not load electron-store constructor.')
}

const store = new (getStoreConstructor())({
  name: 'popcorn-bucket-settings',
  defaults: defaultAppSettings
})

const SECRET_KEYS = [
  'tmdbApiKey',
  'tmdbReadAccessToken',
  'omdbApiKey',
  'openSubtitlesApiKey',
  'torrentClawApiKey'
] as const
type SecretKey = (typeof SECRET_KEYS)[number]

/** Values written by the old `safeStorage` path. New values are stored as plaintext. */
const ENCRYPTED_PREFIX = 'enc:v1:'

/** One keychain read, only for a value the previous version encrypted. Returns null if it can't. */
function decryptLegacy(raw: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(raw.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return null
  }
}

function readSecret(key: SecretKey): string {
  const raw = store.get(key) as unknown
  if (typeof raw !== 'string') return ''
  if (!raw.startsWith(ENCRYPTED_PREFIX)) return raw
  const plain = decryptLegacy(raw)
  if (plain == null) return ''
  store.set(key, plain)
  return plain
}

function writeSecret(key: SecretKey, value: string): void {
  store.set(key, value)
}

/** Rewrite leftover keychain-encrypted secrets as plaintext. Call after app ready. */
export function migrateStoredSecrets(): void {
  for (const key of SECRET_KEYS) readSecret(key)
}

const DEV_ENV_KEYS = [
  'TMDB_API_KEY',
  'TMDB_READ_ACCESS_TOKEN',
  'OMDB_API_KEY',
  'OPENSUBTITLES_API_KEY',
  'TORRENTCLAW_API_KEY'
] as const

/** electron-vite only injects prefixed vars, so read the project `.env` for these keys in dev. */
function loadDevEnvFile(): void {
  if (app.isPackaged) return
  const path = join(process.cwd(), '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!DEV_ENV_KEYS.includes(key as (typeof DEV_ENV_KEYS)[number])) continue
    if (process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadDevEnvFile()

function envOverride(): Partial<AppSettings> {
  return {
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
    tmdbReadAccessToken: process.env.TMDB_READ_ACCESS_TOKEN ?? '',
    omdbApiKey: process.env.OMDB_API_KEY ?? '',
    openSubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY ?? '',
    torrentClawApiKey: process.env.TORRENTCLAW_API_KEY ?? ''
  }
}

/** Effective settings: stored values, with env vars filling empty fields only. */
export function getAppSettings(): AppSettings {
  const env = envOverride()
  const tmdbApiKey = readSecret('tmdbApiKey').trim() || env.tmdbApiKey?.trim() || ''
  const tmdbReadAccessToken =
    readSecret('tmdbReadAccessToken').trim() || env.tmdbReadAccessToken?.trim() || ''
  const omdbApiKey = readSecret('omdbApiKey').trim() || env.omdbApiKey?.trim() || ''
  const openSubtitlesApiKey =
    readSecret('openSubtitlesApiKey').trim() || env.openSubtitlesApiKey?.trim() || ''
  const torrentClawApiKey =
    readSecret('torrentClawApiKey').trim() || env.torrentClawApiKey?.trim() || ''
  return { tmdbApiKey, tmdbReadAccessToken, omdbApiKey, openSubtitlesApiKey, torrentClawApiKey }
}

/** Values saved in the app (what the Settings screen should display). */
export function getStoredSettings(): AppSettings {
  return {
    tmdbApiKey: readSecret('tmdbApiKey'),
    tmdbReadAccessToken: readSecret('tmdbReadAccessToken'),
    omdbApiKey: readSecret('omdbApiKey'),
    openSubtitlesApiKey: readSecret('openSubtitlesApiKey'),
    torrentClawApiKey: readSecret('torrentClawApiKey')
  }
}

/** Persist user-entered credentials (env is not written here). */
export function setAppSettings(partial: Partial<AppSettings>): void {
  for (const key of SECRET_KEYS) {
    const value = partial[key]
    if (value === undefined) continue
    const existing = store.get(key) as unknown
    // A failed keychain decrypt shows up as an empty field. Don't replace the stored secret with that.
    if (!value && typeof existing === 'string' && existing.startsWith(ENCRYPTED_PREFIX)) continue
    writeSecret(key, value)
  }
}
