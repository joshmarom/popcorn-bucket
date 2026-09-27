import type { TorrentSearchInput, TorrentSearchResponse } from '@shared/torrent'
import { normalizeImdbId } from './provider-context'

export type ResolvedTorrentSearch =
  | { valid: false; response: TorrentSearchResponse }
  | { valid: true; query: string; imdbId: string | null; cacheKey: string }

/** Shared query + cache key (must stay in sync with the live search path). */
export function resolveTorrentSearchInput(input: TorrentSearchInput): ResolvedTorrentSearch {
  const year =
    input.releaseDate && input.releaseDate.length >= 4 ? input.releaseDate.slice(0, 4) : ''
  const q = [input.title, year].filter(Boolean).join(' ').trim()
  if (!q) {
    return {
      valid: false,
      response: { ok: false, error: 'Nothing to search for.', code: 'VALIDATION' }
    }
  }
  const imdbId = normalizeImdbId(input.imdbId)
  const cacheKey = `${imdbId ?? 'noimdb'}::${q.toLowerCase()}`
  return { valid: true, query: q, imdbId, cacheKey }
}
