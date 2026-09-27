import type { RawTorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl, isValidMagnetUri } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { formatBytes } from '../format-bytes'
import { magnetFromInfoHash } from '../magnet-from-hash'
import { limitedFetch } from '../fetch-limited'

const PROVIDER = 'EZTV'
const API = 'https://eztv.wf/api/get-torrents'
const PAGE_LIMIT = 100
/** Newest episodes come first; stop once this season has enough copies or the catalog ends. */
const MAX_PAGES = 4
const ENOUGH_MATCHES = 40

export type EztvQueryTarget = { season: number; episode: number | null }

/** Episode searches look like "Show S01E02" or "Show S01". Movies do not, so EZTV stays out of them. */
export function eztvQueryTarget(query: string): EztvQueryTarget | null {
  const m = /\bs(\d{1,2})(?:e(\d{1,3}))?\b/i.exec(query)
  if (!m) return null
  const season = Number(m[1])
  if (!Number.isFinite(season) || season < 1) return null
  const episode = m[2] != null ? Number(m[2]) : null
  return { season, episode: episode != null && episode > 0 ? episode : null }
}

/** Keep the requested episode, and season packs (episode 0) when a specific episode was asked for. */
export function eztvRowMatches(target: EztvQueryTarget, season: number, episode: number): boolean {
  if (season !== target.season || season < 1) return false
  if (target.episode == null) return true
  return episode === target.episode || episode === 0
}

function imdbNumeric(imdbId: string): string {
  return imdbId.replace(/^tt/i, '')
}

type EztvTorrent = {
  hash?: string
  magnet_url?: string
  title?: string
  filename?: string
  episode_url?: string
  season?: string
  episode?: string
  seeds?: number
  peers?: number
  date_released_unix?: number
  size_bytes?: string
}

function toRow(t: EztvTorrent): RawTorrentSource | null {
  const title = (t.title || t.filename || '').trim()
  if (!title) return null
  const magnetUri =
    (typeof t.magnet_url === 'string' && isValidMagnetUri(t.magnet_url) ? t.magnet_url : null) ??
    (typeof t.hash === 'string' ? magnetFromInfoHash(title, t.hash) : null)
  if (!magnetUri) return null

  const bytes = Number(t.size_bytes)
  const seeds = typeof t.seeds === 'number' ? t.seeds : Number(t.seeds)
  const peers = typeof t.peers === 'number' ? t.peers : Number(t.peers)
  const unix =
    typeof t.date_released_unix === 'number' ? t.date_released_unix : Number(t.date_released_unix)
  const details =
    typeof t.episode_url === 'string' && isSafeTorrentDetailsUrl(t.episode_url)
      ? t.episode_url
      : null

  return {
    title,
    providerName: PROVIDER,
    size: Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes) : null,
    seeders: Number.isFinite(seeds) ? Math.max(0, Math.floor(seeds)) : 0,
    leechers: Number.isFinite(peers) ? Math.max(0, Math.floor(peers)) : 0,
    magnetUri,
    torrentFileUrl: null,
    detailsUrl: details,
    uploadDate:
      Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString().slice(0, 10) : null
  }
}

export async function searchEztv(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<RawTorrentSource[]> {
  const target = eztvQueryTarget(ctx.query)
  if (!ctx.imdbId || !target) return []

  const out: RawTorrentSource[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API}?imdb_id=${encodeURIComponent(imdbNumeric(ctx.imdbId))}&limit=${PAGE_LIMIT}&page=${page}`
    const res = await limitedFetch(url, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json: unknown = await res.json()
    if (!json || typeof json !== 'object') break
    const torrents = (json as { torrents?: unknown }).torrents
    if (!Array.isArray(torrents) || torrents.length === 0) break

    for (const raw of torrents) {
      if (!raw || typeof raw !== 'object') continue
      const t = raw as EztvTorrent
      const season = Number(t.season)
      const episode = Number(t.episode)
      if (!eztvRowMatches(target, season, Number.isFinite(episode) ? episode : -1)) continue
      const row = toRow(t)
      if (row) out.push(row)
    }

    if (torrents.length < PAGE_LIMIT || out.length >= ENOUGH_MATCHES) break
  }
  return out
}
