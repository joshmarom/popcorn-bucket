import type { TorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl, isValidMagnetUri } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { formatBytes } from '../format-bytes'
import { limitedFetch } from '../fetch-limited'

const PROVIDER = 'Knaben'
const API = 'https://api.knaben.org/v1'

function absolutizeDetails(raw: string): string | null {
  const u = raw.trim()
  if (!u) return null
  const full = u.startsWith('http') ? u : `https://knaben.org${u.startsWith('/') ? u : `/${u}`}`
  return isSafeTorrentDetailsUrl(full) ? full : null
}

export async function searchKnaben(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<TorrentSource[]> {
  const q = ctx.query.trim()
  if (!q) return []

  const body = {
    query: q,
    size: 300,
    order_by: 'seeders',
    order_direction: 'desc',
    hide_unsafe: true,
    hide_xxx: true,
    categories: [3_000_000, 2_000_000]
  }

  const res = await limitedFetch(API, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json: unknown = await res.json()
  if (!json || typeof json !== 'object' || !('hits' in json)) return []
  const hits = (json as { hits: unknown }).hits
  if (!Array.isArray(hits)) return []

  const out: TorrentSource[] = []
  for (const raw of hits) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title : null
    const magnetUri = typeof o.magnetUrl === 'string' ? o.magnetUrl : null
    if (!title || !magnetUri || !isValidMagnetUri(magnetUri)) continue

    const bytes = typeof o.bytes === 'number' ? o.bytes : Number(o.bytes)
    if (!Number.isFinite(bytes)) continue

    const seedersRaw = typeof o.seeders === 'number' ? o.seeders : Number(o.seeders)
    const peersRaw = typeof o.peers === 'number' ? o.peers : Number(o.peers)
    const seeders = Number.isFinite(seedersRaw) ? Math.max(0, Math.floor(seedersRaw)) : 0
    const leechers = Number.isFinite(peersRaw) ? Math.max(0, Math.floor(peersRaw)) : 0
    const dateStr = typeof o.date === 'string' ? o.date : null
    const uploadDate = dateStr ? dateStr.slice(0, 10) : null
    const detailsRaw = typeof o.details === 'string' ? o.details : ''
    const detailsUrl = absolutizeDetails(detailsRaw)

    out.push({
      title,
      providerName: PROVIDER,
      size: formatBytes(bytes),
      seeders,
      leechers,
      magnetUri,
      torrentFileUrl: null,
      detailsUrl,
      uploadDate
    })
  }
  return out
}
