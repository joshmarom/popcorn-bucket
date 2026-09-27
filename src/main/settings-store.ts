import * as ElectronStoreModule from 'electron-store'
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

function envOverride(): Partial<AppSettings> {
  return {
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
    tmdbReadAccessToken: process.env.TMDB_READ_ACCESS_TOKEN ?? '',
    omdbApiKey: process.env.OMDB_API_KEY ?? ''
  }
}

/** Effective settings: stored values, with env vars filling empty fields only. */
export function getAppSettings(): AppSettings {
  const env = envOverride()
  const tmdbApiKey = store.get('tmdbApiKey').trim() || env.tmdbApiKey?.trim() || ''
  const tmdbReadAccessToken =
    store.get('tmdbReadAccessToken').trim() || env.tmdbReadAccessToken?.trim() || ''
  const omdbApiKey = String(store.get('omdbApiKey') ?? '').trim() || env.omdbApiKey?.trim() || ''
  return { tmdbApiKey, tmdbReadAccessToken, omdbApiKey }
}

/** Values saved in the app (what the Settings screen should display). */
export function getStoredSettings(): AppSettings {
  return {
    tmdbApiKey: store.get('tmdbApiKey'),
    tmdbReadAccessToken: store.get('tmdbReadAccessToken'),
    omdbApiKey: String(store.get('omdbApiKey') ?? '')
  }
}

/** Persist user-entered credentials (env is not written here). */
export function setAppSettings(partial: Partial<AppSettings>): void {
  if (partial.tmdbApiKey !== undefined) {
    store.set('tmdbApiKey', partial.tmdbApiKey)
  }
  if (partial.tmdbReadAccessToken !== undefined) {
    store.set('tmdbReadAccessToken', partial.tmdbReadAccessToken)
  }
  if (partial.omdbApiKey !== undefined) {
    store.set('omdbApiKey', partial.omdbApiKey)
  }
}
