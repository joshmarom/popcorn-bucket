import { limitedFetch } from './fetch-limited'
import { normalizeImdbId } from './provider-context'

const API_BASE = 'https://apibay.org/precompiled'

export type TpbTrendingRow = {
  infoHashLower: string
  imdbId: string
  seeders: number
  leechers: number
  addedUnix: number
}

function parseIntLoose(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}

function parseTpbJsonArray(json: unknown): Record<string, unknown>[] {
  if (!Array.isArray(json)) return []
  return json.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
}

function rowToCandidate(raw: Record<string, unknown>): TpbTrendingRow | null {
  const hashRaw = typeof raw.info_hash === 'string' ? raw.info_hash : null
  if (!hashRaw) return null
  const infoHashLower = hashRaw.replace(/[^a-fA-F0-9]/g, '').toLowerCase()
  if (infoHashLower.length !== 40) return null

  const imdbRaw = raw.imdb
  const imdbStr =
    typeof imdbRaw === 'string' ? imdbRaw : typeof imdbRaw === 'number' ? String(imdbRaw) : null
  const imdbId = normalizeImdbId(imdbStr)
  if (!imdbId) return null

  const seeders = parseIntLoose(raw.seeders)
  const leechers = parseIntLoose(raw.leechers)
  const added = parseIntLoose(raw.added)

  return {
    infoHashLower,
    imdbId,
    seeders: Math.max(0, seeders),
    leechers: Math.max(0, leechers),
    addedUnix: added > 0 ? added : 0
  }
}

/** Merge two precompiled top-100 lists by info-hash; keep stronger swarm stats. */
function mergeByHash(rows: TpbTrendingRow[]): TpbTrendingRow[] {
  const map = new Map<string, TpbTrendingRow>()
  for (const r of rows) {
    const prev = map.get(r.infoHashLower)
    if (
      !prev ||
      r.seeders > prev.seeders ||
      (r.seeders === prev.seeders && r.leechers > prev.leechers)
    ) {
      map.set(r.infoHashLower, r)
    }
  }
  return [...map.values()]
}

/**
 * Movie torrents from apibay precompiled lists (categories 201 + 207), deduped by info-hash, with a
 * valid `imdb` id. Sorted by seeders (newest swarm first among precompiled rows).
 */
export async function fetchTpbMovieRowsWithImdb(signal?: AbortSignal): Promise<TpbTrendingRow[]> {
  return fetchTpbRowsWithImdb(['201', '207'], signal)
}

/** TV episodes and packs from the precompiled TV (205) and HD TV (208) lists; `imdb` is the show. */
export async function fetchTpbTvRowsWithImdb(signal?: AbortSignal): Promise<TpbTrendingRow[]> {
  return fetchTpbRowsWithImdb(['205', '208'], signal)
}

async function fetchTpbRowsWithImdb(
  categories: string[],
  signal?: AbortSignal
): Promise<TpbTrendingRow[]> {
  const urls = categories.map((c) => `${API_BASE}/data_top100_${c}.json`)
  const merged: TpbTrendingRow[] = []

  for (const url of urls) {
    const res = await limitedFetch(url, { signal })
    if (!res.ok) {
      throw new Error(`TPB precompiled HTTP ${res.status}`)
    }
    const json: unknown = await res.json()
    for (const raw of parseTpbJsonArray(json)) {
      const c = rowToCandidate(raw)
      if (c) merged.push(c)
    }
  }

  const deduped = mergeByHash(merged)
  return deduped.sort((a, b) => b.seeders - a.seeders)
}

/** Info-hash (lowercase) → IMDb for cross-provider matching (e.g. Knaben ↔ TPB). */
export function buildImdbByInfoHash(rows: TpbTrendingRow[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of rows) {
    if (!m.has(r.infoHashLower)) {
      m.set(r.infoHashLower, r.imdbId)
    }
  }
  return m
}
