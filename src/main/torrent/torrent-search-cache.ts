import type { TorrentSearchResponse } from '@shared/torrent'
import { getLibrary } from '../library/db'
import { readTorrentSearch, writeTorrentSearch } from '../library/torrents'

/** A search stays fresh for 5 days. Older torrent rows stay in the library. */
export function readTorrentSearchCache(cacheKey: string): TorrentSearchResponse | null {
  return readTorrentSearch(getLibrary(), cacheKey)
}

export function writeTorrentSearchCache(
  cacheKey: string,
  response: Extract<TorrentSearchResponse, { ok: true }>
): void {
  writeTorrentSearch(getLibrary(), cacheKey, response)
}
