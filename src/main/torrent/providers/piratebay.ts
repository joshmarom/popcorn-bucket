import type { RawTorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { formatBytes } from '../format-bytes'
import { magnetFromInfoHash } from '../magnet-from-hash'
import { limitedFetch } from '../fetch-limited'

const PROVIDER = 'ThePirateBay'
/** Public JSON mirror used by TorrentSearch. */
const API = 'https://apibay.org/q.php'
const SITE = 'https://thepiratebay.org'

async function queryApibay(q: string, signal: AbortSignal): Promise<unknown[]> {
  const res = await limitedFetch(`${API}?q=${encodeURIComponent(q)}&cat=200`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json: unknown = await res.json()
  if (!Array.isArray(json)) return []
  return json.filter(
    (o) => o && typeof o === 'object' && (o as { name?: unknown }).name !== 'No results returned'
  )
}

/** apibay indexes IMDb ids, so an id search is exact; text search is the fallback. */
export async function searchPirateBay(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<RawTorrentSource[]> {
  const q = ctx.query.trim()
  if (!q && !ctx.imdbId) return []

  let json: unknown[] = ctx.imdbId ? await queryApibay(ctx.imdbId, signal) : []
  if (json.length === 0 && q) json = await queryApibay(q, signal)

  const out: RawTorrentSource[] = []
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : null
    if (!name) continue

    const id = typeof o.id === 'string' ? o.id : null
    const infoHash = typeof o.info_hash === 'string' ? o.info_hash : null
    if (!id || !infoHash) continue

    const detailsUrl = `${SITE}/description.php?id=${encodeURIComponent(id)}`
    if (!isSafeTorrentDetailsUrl(detailsUrl)) continue

    const sizeStr = typeof o.size === 'string' ? o.size : String(o.size ?? '')
    const sizeBytes = Number.parseInt(sizeStr, 10)
    if (!Number.isFinite(sizeBytes)) continue

    const seeders = Number.parseInt(String(o.seeders ?? ''), 10)
    const leechers = Number.parseInt(String(o.leechers ?? ''), 10)
    if (!Number.isFinite(seeders) || !Number.isFinite(leechers)) continue

    const added = typeof o.added === 'string' ? Number.parseInt(o.added, 10) : Number(o.added)
    const uploadDate =
      Number.isFinite(added) && added > 0 ? new Date(added * 1000).toISOString().slice(0, 10) : null

    const magnetUri = magnetFromInfoHash(name, infoHash)
    if (!magnetUri) continue

    out.push({
      title: name,
      providerName: PROVIDER,
      size: formatBytes(sizeBytes),
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
