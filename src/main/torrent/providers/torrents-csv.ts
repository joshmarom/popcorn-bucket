import type { RawTorrentSource } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { formatBytes } from '../format-bytes'
import { magnetFromInfoHash } from '../magnet-from-hash'
import { limitedFetch } from '../fetch-limited'

const PROVIDER = 'TorrentsCSV'
const BASE = 'https://torrents-csv.com'

export async function searchTorrentsCsv(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<RawTorrentSource[]> {
  const q = ctx.query.trim()
  if (!q) return []

  const url = `${BASE}/service/search?q=${encodeURIComponent(q)}`
  const res = await limitedFetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json: unknown = await res.json()
  if (!json || typeof json !== 'object' || !('torrents' in json)) return []
  const torrents = (json as { torrents: unknown }).torrents
  if (!Array.isArray(torrents)) return []

  const out: RawTorrentSource[] = []
  for (const raw of torrents) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : null
    const infohash = typeof o.infohash === 'string' ? o.infohash : null
    if (!name || !infohash) continue

    const sizeBytes = typeof o.size_bytes === 'number' ? o.size_bytes : Number(o.size_bytes)
    if (!Number.isFinite(sizeBytes)) continue

    const seedersRaw = typeof o.seeders === 'number' ? o.seeders : Number(o.seeders)
    const leechersRaw = typeof o.leechers === 'number' ? o.leechers : Number(o.leechers)
    const seeders = Number.isFinite(seedersRaw) ? Math.max(0, Math.floor(seedersRaw)) : 0
    const leechers = Number.isFinite(leechersRaw) ? Math.max(0, Math.floor(leechersRaw)) : 0

    const created =
      typeof o.created_unix === 'number'
        ? o.created_unix
        : Number.parseInt(String(o.created_unix), 10)
    const uploadDate =
      Number.isFinite(created) && created > 0
        ? new Date(created * 1000).toISOString().slice(0, 10)
        : null

    const magnetUri = magnetFromInfoHash(name, infohash)
    if (!magnetUri) continue

    out.push({
      title: name,
      providerName: PROVIDER,
      size: formatBytes(sizeBytes),
      seeders,
      leechers,
      magnetUri,
      torrentFileUrl: null,
      detailsUrl: null,
      uploadDate
    })
  }
  return out
}
