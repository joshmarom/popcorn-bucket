import { limitedFetch } from './fetch-limited'
import { normalizeImdbId } from './provider-context'

const API = 'https://api.knaben.org/v1'

const IMDB_IN_TITLE = /\b(tt\d{7,})\b/i

function btihFromMagnet(magnet: string): string | null {
  const m = /btih:([a-f0-9]{40})/i.exec(magnet.trim())
  if (!m) return null
  return m[1]!.toLowerCase()
}

function parseIsoDateUnix(iso: string | null): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

export type KnabenTrendingScore = {
  imdbId: string
  seeders: number
  peers: number
  latestUploadUnix: number
}

/**
 * Top `size` movie-category hits from Knaben (wildcard query), ordered by seeders.
 * IMDb: prefer `imdbByHash` lookup from TPB rows, else `tt…` in release title.
 */
export async function fetchKnabenTrendingByImdb(
  size: number,
  imdbByHash: Map<string, string>,
  signal?: AbortSignal
): Promise<KnabenTrendingScore[]> {
  const res = await limitedFetch(API, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: '*',
      size,
      order_by: 'seeders',
      order_direction: 'desc',
      hide_unsafe: true,
      hide_xxx: true,
      categories: [3_000_000, 2_000_000]
    })
  })
  if (!res.ok) {
    throw new Error(`Knaben trending HTTP ${res.status}`)
  }

  const json: unknown = await res.json()
  if (!json || typeof json !== 'object' || !('hits' in json)) return []
  const hits = (json as { hits: unknown }).hits
  if (!Array.isArray(hits)) return []

  const byImdb = new Map<string, { seeders: number; peers: number; latestUploadUnix: number }>()

  for (const raw of hits) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const magnet = typeof o.magnetUrl === 'string' ? o.magnetUrl : ''
    const title = typeof o.title === 'string' ? o.title : ''
    if (!magnet || !title) continue

    const hash = btihFromMagnet(magnet)
    const fromHash = hash ? imdbByHash.get(hash) : undefined
    const fromTitle = IMDB_IN_TITLE.exec(title)?.[1] ?? null
    const imdbId = normalizeImdbId(fromHash ?? fromTitle)
    if (!imdbId) continue

    const seedersRaw = typeof o.seeders === 'number' ? o.seeders : Number(o.seeders)
    const peersRaw = typeof o.peers === 'number' ? o.peers : Number(o.peers)
    const seeders = Number.isFinite(seedersRaw) ? Math.max(0, Math.floor(seedersRaw)) : 0
    const peers = Number.isFinite(peersRaw) ? Math.max(0, Math.floor(peersRaw)) : 0
    const dateStr = typeof o.date === 'string' ? o.date : null
    const latestUploadUnix = parseIsoDateUnix(dateStr)

    const prev = byImdb.get(imdbId)
    if (!prev) {
      byImdb.set(imdbId, { seeders, peers, latestUploadUnix })
    } else {
      byImdb.set(imdbId, {
        seeders: Math.max(prev.seeders, seeders),
        peers: Math.max(prev.peers, peers),
        latestUploadUnix: Math.max(prev.latestUploadUnix, latestUploadUnix)
      })
    }
  }

  return [...byImdb.entries()].map(([imdbId, v]) => ({
    imdbId,
    ...v
  }))
}
