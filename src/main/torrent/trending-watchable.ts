import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { AppSettings } from '@shared/app-settings'
import { shouldIncludeCatalogListItem, type CatalogMovieListItem } from '@shared/catalog'
import { enrichCatalogListWithOmdb } from '../omdb'
import { findMovieListItemByImdbId, getNowPlayingMovies } from '../tmdb'
import { fetchMergedTrendingCandidates } from './trending-candidates'

const CACHE_DIR = 'torrent-trending'
const CACHE_FILE = 'watchable-trending.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** Max IMDb rows to resolve through TMDB per rebuild (cold-start budget). */
const MAX_TMDB_RESOLVE = 100
/** OMDb list enrichment only for this many leading rows (avoids long cold rebuilds). */
const OMDB_ENRICH_HEAD = 20

/** Parallel TMDB lookups during a rebuild; keeps order and stays under TMDB rate limits. */
const TMDB_CONCURRENCY = 8

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

type CachedPayload = {
  generatedAtMs: number
  items: CatalogMovieListItem[]
}

function cachePath(): string {
  return join(app.getPath('userData'), CACHE_DIR, CACHE_FILE)
}

async function readDiskCache(): Promise<CachedPayload | null> {
  try {
    const raw = await readFile(cachePath(), 'utf8')
    const parsed = JSON.parse(raw) as CachedPayload
    if (
      typeof parsed?.generatedAtMs !== 'number' ||
      !Array.isArray(parsed.items) ||
      parsed.generatedAtMs <= 0
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function writeDiskCache(payload: CachedPayload): Promise<void> {
  const dir = join(app.getPath('userData'), CACHE_DIR)
  await mkdir(dir, { recursive: true })
  await writeFile(cachePath(), JSON.stringify(payload), 'utf8')
}

export type GetTrendingWatchableOpts = {
  /** When true, ignore the on-disk snapshot and rebuild from indexers + TMDB. */
  forceRefresh?: boolean
}

/**
 * Home “trending” rail: YTS `list_movies` + TPB precompiled movie lists + Knaben top movie hits,
 * merged and deduped by IMDb, mapped through TMDB find,
 * lightly OMDb-enriched on the head only, cached ~24h. Falls back to TMDB now playing when YTS/TMDB
 * yields no rows; fallback is not written to disk so the next load retries discovery.
 */
export async function getTrendingWatchableMovies(
  settings: AppSettings,
  opts?: GetTrendingWatchableOpts
): Promise<CatalogMovieListItem[]> {
  const forceRefresh = opts?.forceRefresh === true
  if (!forceRefresh) {
    const hit = await readDiskCache()
    if (hit != null && Date.now() - hit.generatedAtMs < CACHE_TTL_MS && hit.items.length > 0) {
      return hit.items
    }
  }

  let resolved: CatalogMovieListItem[] = []

  try {
    const candidates = await fetchMergedTrendingCandidates()
    const top = candidates.slice(0, MAX_TMDB_RESOLVE)
    const items = await mapWithConcurrency(top, TMDB_CONCURRENCY, (c) =>
      findMovieListItemByImdbId(settings, c.imdbId).catch(() => null)
    )
    resolved = items.filter((item): item is CatalogMovieListItem => item != null)
  } catch {
    resolved = []
  }

  let fromTorrents = true
  if (resolved.length === 0) {
    fromTorrents = false
    resolved = await getNowPlayingMovies(settings)
  }

  const enrichHeadAndFilter = async (
    items: CatalogMovieListItem[]
  ): Promise<CatalogMovieListItem[]> => {
    const head = items.slice(0, OMDB_ENRICH_HEAD)
    const tail = items.slice(OMDB_ENRICH_HEAD)
    const enrichedHead = await enrichCatalogListWithOmdb(settings, head)
    return [...enrichedHead, ...tail].filter(shouldIncludeCatalogListItem)
  }

  let filtered = await enrichHeadAndFilter(resolved)

  if (filtered.length === 0) {
    const fallback = await getNowPlayingMovies(settings)
    filtered = await enrichHeadAndFilter(fallback)
    return filtered
  }

  if (fromTorrents) {
    await writeDiskCache({ generatedAtMs: Date.now(), items: filtered })
  }

  return filtered
}
