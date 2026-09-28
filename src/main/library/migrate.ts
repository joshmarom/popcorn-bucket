import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { TorrentProviderError, RawTorrentSource } from '@shared/torrent'
import { withReleaseInfo } from '@shared/torrent'
import type { WatchProgress } from '@shared/watch-history'
import { getLibrary, type LibraryDb } from './db'
import { writeTorrentSearch } from './torrents'
import { MY_LIST, replaceMovieList, saveWatchProgress } from './watch'

const LEGACY_IMPORTED = 'electron_store_imported'

export type LegacyTorrentEntry = {
  savedAt: number
  results: RawTorrentSource[]
  errors: TorrentProviderError[]
}

export type LegacyLibrarySnapshot = {
  watchlist: number[]
  progress: WatchProgress[]
  torrentEntries: Record<string, LegacyTorrentEntry>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isWatchProgress(value: unknown): value is WatchProgress {
  if (!isRecord(value)) return false
  return (
    typeof value.movieId === 'number' &&
    typeof value.position === 'number' &&
    typeof value.duration === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.finished === 'boolean'
  )
}

function isTorrentResult(value: unknown): value is RawTorrentSource {
  if (!isRecord(value)) return false
  return (
    typeof value.title === 'string' &&
    typeof value.providerName === 'string' &&
    (value.size === null || typeof value.size === 'string') &&
    typeof value.seeders === 'number' &&
    typeof value.leechers === 'number' &&
    (value.magnetUri === null || typeof value.magnetUri === 'string') &&
    (value.torrentFileUrl === null || typeof value.torrentFileUrl === 'string') &&
    (value.detailsUrl === null || typeof value.detailsUrl === 'string') &&
    (value.uploadDate === null || typeof value.uploadDate === 'string')
  )
}

function isProviderError(value: unknown): value is TorrentProviderError {
  return isRecord(value) && typeof value.provider === 'string' && typeof value.message === 'string'
}

export function wasLegacyImported(db: LibraryDb): boolean {
  const row = db.prepare('SELECT value FROM library_meta WHERE key = ?').get(LEGACY_IMPORTED) as
    | { value: string }
    | undefined
  return row?.value === '1'
}

/** Copies one electron-store snapshot. A second call leaves the library as it is. */
export function importLegacySnapshot(db: LibraryDb, snapshot: LegacyLibrarySnapshot): boolean {
  if (wasLegacyImported(db)) return false
  const run = db.transaction(() => {
    replaceMovieList(
      db,
      MY_LIST,
      snapshot.watchlist.filter((id) => Number.isInteger(id))
    )
    for (const progress of snapshot.progress) saveWatchProgress(db, progress)
    for (const [cacheKey, entry] of Object.entries(snapshot.torrentEntries)) {
      writeTorrentSearch(
        db,
        cacheKey,
        {
          ok: true,
          results: entry.results.map(withReleaseInfo),
          errors: entry.errors
        },
        entry.savedAt
      )
    }
    db.prepare('INSERT INTO library_meta (key, value) VALUES (?, ?)').run(LEGACY_IMPORTED, '1')
  })
  run()
  return true
}

function readStoreFile(name: string): unknown {
  const file = join(app.getPath('userData'), `${name}.json`)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch (error) {
    console.error(`Could not read ${name}.json`, error)
    return null
  }
}

function readLegacySnapshot(): LegacyLibrarySnapshot {
  const history = readStoreFile('popcorn-bucket-watch-history')
  const cache = readStoreFile('popcorn-bucket-torrent-search-cache')

  const watchlist =
    isRecord(history) && Array.isArray(history.watchlist)
      ? history.watchlist.filter(
          (id): id is number => typeof id === 'number' && Number.isInteger(id)
        )
      : []

  const progress =
    isRecord(history) && isRecord(history.progress)
      ? Object.values(history.progress).filter(isWatchProgress)
      : []

  const torrentEntries: Record<string, LegacyTorrentEntry> = {}
  if (isRecord(cache) && isRecord(cache.entries)) {
    for (const [cacheKey, entry] of Object.entries(cache.entries)) {
      if (!isRecord(entry) || typeof entry.savedAt !== 'number') continue
      const results = Array.isArray(entry.results) ? entry.results.filter(isTorrentResult) : []
      const errors = Array.isArray(entry.errors) ? entry.errors.filter(isProviderError) : []
      torrentEntries[cacheKey] = { savedAt: entry.savedAt, results, errors }
    }
  }

  return { watchlist, progress, torrentEntries }
}

/** One-time copy of the watchlist, watch progress, and torrent search cache. JSON files stay put. */
export function importLegacyLibrary(): void {
  const db = getLibrary()
  if (wasLegacyImported(db)) return
  importLegacySnapshot(db, readLegacySnapshot())
}
