import { limitedFetch } from './fetch-limited'
import { normalizeImdbId } from './provider-context'

const API_BASE = 'https://yts.bz/api/v2'

/** Four pages × 50 = up to 200 YTS movie rows before IMDb dedupe. */
const LIST_PAGES = 4
const LIST_LIMIT = 50

export type YtsTrendingCandidate = {
  imdbId: string
  /** Max seeds across all qualities for this title (swarm strength). */
  maxSeeds: number
  maxPeers: number
  latestUploadUnix: number
}

function aggregateScore(c: Omit<YtsTrendingCandidate, 'imdbId'>): number {
  return c.maxSeeds * 1_000_000 + c.maxPeers * 1000 + c.latestUploadUnix / 1_000_000
}

function parseMoviesPage(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== 'object') return []
  const root = json as { status?: string; data?: unknown }
  if (root.status !== 'ok' || root.data == null || typeof root.data !== 'object') return []
  const movies = (root.data as { movies?: unknown }).movies
  if (!Array.isArray(movies)) return []
  return movies.filter((m): m is Record<string, unknown> => m != null && typeof m === 'object')
}

function mergeMovieIntoMap(
  map: Map<string, { maxSeeds: number; maxPeers: number; latestUploadUnix: number }>,
  movie: Record<string, unknown>
): void {
  const imdbRaw = movie.imdb_code
  const imdbId = normalizeImdbId(typeof imdbRaw === 'string' ? imdbRaw : null)
  if (!imdbId) return

  const torrents = movie.torrents
  let maxSeeds = 0
  let maxPeers = 0
  let latestUploadUnix = 0
  if (Array.isArray(torrents)) {
    for (const raw of torrents) {
      if (!raw || typeof raw !== 'object') continue
      const t = raw as Record<string, unknown>
      const seedsRaw = typeof t.seeds === 'number' ? t.seeds : Number(t.seeds)
      const peersRaw = typeof t.peers === 'number' ? t.peers : Number(t.peers)
      const unixRaw =
        typeof t.date_uploaded_unix === 'number'
          ? t.date_uploaded_unix
          : Number(t.date_uploaded_unix)
      const seeds = Number.isFinite(seedsRaw) ? Math.max(0, Math.floor(seedsRaw)) : 0
      const peers = Number.isFinite(peersRaw) ? Math.max(0, Math.floor(peersRaw)) : 0
      const unix = Number.isFinite(unixRaw) && unixRaw > 0 ? unixRaw : 0
      maxSeeds = Math.max(maxSeeds, seeds)
      maxPeers = Math.max(maxPeers, peers)
      latestUploadUnix = Math.max(latestUploadUnix, unix)
    }
  }

  const prev = map.get(imdbId)
  if (!prev) {
    map.set(imdbId, { maxSeeds, maxPeers, latestUploadUnix })
    return
  }
  map.set(imdbId, {
    maxSeeds: Math.max(prev.maxSeeds, maxSeeds),
    maxPeers: Math.max(prev.maxPeers, maxPeers),
    latestUploadUnix: Math.max(prev.latestUploadUnix, latestUploadUnix)
  })
}

/**
 * YTS `list_movies` browse (not title search): sort by swarm, paginate, dedupe by IMDb.
 * Score orders titles by max seeds, then peers, then recency of newest torrent row.
 */
export async function fetchYtsTrendingCandidates(
  signal?: AbortSignal
): Promise<YtsTrendingCandidate[]> {
  const ac = signal ?? undefined
  const byImdb = new Map<string, { maxSeeds: number; maxPeers: number; latestUploadUnix: number }>()

  for (let page = 1; page <= LIST_PAGES; page++) {
    const u = new URL(`${API_BASE}/list_movies.json`)
    u.searchParams.set('sort_by', 'seeds')
    u.searchParams.set('order_by', 'desc')
    u.searchParams.set('limit', String(LIST_LIMIT))
    u.searchParams.set('page', String(page))

    const res = await limitedFetch(u.toString(), { signal: ac })
    if (!res.ok) {
      throw new Error(`YTS list_movies HTTP ${res.status}`)
    }
    const json: unknown = await res.json()
    const movies = parseMoviesPage(json)
    for (const m of movies) {
      mergeMovieIntoMap(byImdb, m)
    }
  }

  const candidates: YtsTrendingCandidate[] = [...byImdb.entries()].map(([imdbId, v]) => ({
    imdbId,
    ...v
  }))

  return candidates.sort((a, b) => aggregateScore(b) - aggregateScore(a))
}
