import * as ElectronStoreModule from 'electron-store'
import type { TorrentProviderError, TorrentSearchResponse, TorrentSource } from '@shared/torrent'

type StoreCtor = typeof import('electron-store').default

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

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 100

type CachedPayload = {
  savedAt: number
  results: TorrentSource[]
  errors: TorrentProviderError[]
}

type CacheShape = {
  entries: Record<string, CachedPayload>
}

const cacheStore = new (getStoreConstructor())({
  name: 'popcorn-bucket-torrent-search-cache',
  defaults: { entries: {} } satisfies CacheShape
})

function pruneEntries(entries: Record<string, CachedPayload>): void {
  const now = Date.now()
  for (const key of Object.keys(entries)) {
    if (now - entries[key]!.savedAt > FIVE_DAYS_MS) {
      delete entries[key]
    }
  }
  const pairs = Object.entries(entries).sort((a, b) => b[1].savedAt - a[1].savedAt)
  if (pairs.length > MAX_ENTRIES) {
    for (const [k] of pairs.slice(MAX_ENTRIES)) {
      delete entries[k]
    }
  }
}

export function readTorrentSearchCache(cacheKey: string): TorrentSearchResponse | null {
  const entries = { ...cacheStore.get('entries') }
  pruneEntries(entries)
  cacheStore.set('entries', entries)

  const row = entries[cacheKey]
  if (!row) return null
  if (Date.now() - row.savedAt > FIVE_DAYS_MS) return null

  return {
    ok: true,
    results: row.results,
    errors: row.errors,
    cached: true,
    cachedAtMs: row.savedAt
  }
}

export function writeTorrentSearchCache(
  cacheKey: string,
  response: Extract<TorrentSearchResponse, { ok: true }>
): void {
  const entries = { ...cacheStore.get('entries') }
  entries[cacheKey] = {
    savedAt: Date.now(),
    results: response.results,
    errors: response.errors
  }
  pruneEntries(entries)
  cacheStore.set('entries', entries)
}
