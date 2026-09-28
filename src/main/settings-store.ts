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
  'openSubtitlesApiKey'
] as const
type SecretKey = (typeof SECRET_KEYS)[number]

/** Values written by `safeStorage` carry this prefix; anything else is legacy plaintext. */
const ENCRYPTED_PREFIX = 'enc:v1:'

export function isSecretStorageEncrypted(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function encodeSecret(value: string): string {
  if (!value || !isSecretStorageEncrypted()) return value
  return ENCRYPTED_PREFIX + safeStorage.encryptString(value).toString('base64')
}

function decodeSecret(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value
  if (!isSecretStorageEncrypted()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

function readSecret(key: SecretKey): string {
  return decodeSecret(store.get(key))
}

function writeSecret(key: SecretKey, value: string): void {
  store.set(key, encodeSecret(value))
}

/** Re-save plaintext keys from older versions in encrypted form. Call after app ready. */
export function migratePlaintextSecrets(): void {
  if (!isSecretStorageEncrypted()) return
  for (const key of SECRET_KEYS) {
    const raw = store.get(key) as unknown
    if (typeof raw === 'string' && raw && !raw.startsWith(ENCRYPTED_PREFIX)) {
      writeSecret(key, raw)
    }
  }
}

const DEV_ENV_KEYS = [
  'TMDB_API_KEY',
  'TMDB_READ_ACCESS_TOKEN',
  'OMDB_API_KEY',
  'OPENSUBTITLES_API_KEY'
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
    openSubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY ?? ''
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
  return { tmdbApiKey, tmdbReadAccessToken, omdbApiKey, openSubtitlesApiKey }
}

/** Values saved in the app (what the Settings screen should display). */
export function getStoredSettings(): AppSettings {
  return {
    tmdbApiKey: readSecret('tmdbApiKey'),
    tmdbReadAccessToken: readSecret('tmdbReadAccessToken'),
    omdbApiKey: readSecret('omdbApiKey'),
    openSubtitlesApiKey: readSecret('openSubtitlesApiKey')
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
