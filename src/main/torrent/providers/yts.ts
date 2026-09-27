import type { TorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { magnetFromInfoHash } from '../magnet-from-hash'
import { limitedFetch } from '../fetch-limited'

const PROVIDER = 'YTS'
const API_BASE = 'https://yts.bz/api/v2'

type YtsTorrent = {
  hash?: string
  quality?: string
  type?: string
  video_codec?: string
  size?: string
  seeds?: number
  peers?: number
  date_uploaded_unix?: number
}

function parseMovieTorrents(movie: Record<string, unknown>): TorrentSource[] {
  const descriptionPageUrl =
    typeof movie.url === 'string' && isSafeTorrentDetailsUrl(movie.url) ? movie.url : null
  const titleLong = typeof movie.title_long === 'string' ? movie.title_long : null
  if (!titleLong) return []

  const torrents = movie.torrents
  if (!Array.isArray(torrents)) return []

  const out: TorrentSource[] = []
  for (const raw of torrents) {
    if (!raw || typeof raw !== 'object') continue
    const t = raw as YtsTorrent
    const quality = t.quality ?? '-'
    const type = t.type ?? '-'
    const codec = t.video_codec ?? '-'
    const name = `${titleLong} [${quality}] [${type}] [${codec}]`
    const hash = typeof t.hash === 'string' ? t.hash : null
    const size = typeof t.size === 'string' ? t.size : null
    if (!hash || !size) continue

    const seeds = typeof t.seeds === 'number' ? t.seeds : Number(t.seeds)
    const peers = typeof t.peers === 'number' ? t.peers : Number(t.peers)
    if (!Number.isFinite(seeds) || !Number.isFinite(peers)) continue

    const unix =
      typeof t.date_uploaded_unix === 'number' ? t.date_uploaded_unix : Number(t.date_uploaded_unix)
    const uploadDate =
      Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString().slice(0, 10) : null

    const magnetUri = magnetFromInfoHash(name, hash)
    if (!magnetUri) continue

    out.push({
      title: name,
      providerName: PROVIDER,
      size,
      seeders: Math.max(0, Math.floor(seeds)),
      leechers: Math.max(0, Math.floor(peers)),
      magnetUri,
      torrentFileUrl: null,
      detailsUrl: descriptionPageUrl,
      uploadDate
    })
  }
  return out
}

export async function searchYts(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<TorrentSource[]> {
  const imdb = ctx.imdbId
  const term = ctx.query.trim()
  if (!term && !imdb) return []

  let url: string
  if (imdb) {
    url = `${API_BASE}/movie_details.json?imdb_id=${encodeURIComponent(imdb)}&with_images=false&with_cast=false`
  } else {
    url = `${API_BASE}/list_movies.json?query_term=${encodeURIComponent(term)}&limit=50`
  }

  const res = await limitedFetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const json: unknown = await res.json()
  if (!json || typeof json !== 'object') return []
  const root = json as { status?: string; data?: unknown }
  if (root.status !== 'ok' || root.data == null) return []

  const data = root.data as Record<string, unknown>

  if (imdb) {
    const movie = data.movie
    if (!movie || typeof movie !== 'object') return []
    return parseMovieTorrents(movie as Record<string, unknown>)
  }

  const movies = data.movies
  if (!Array.isArray(movies)) return []
  const out: TorrentSource[] = []
  for (const m of movies) {
    if (m && typeof m === 'object') {
      out.push(...parseMovieTorrents(m as Record<string, unknown>))
    }
  }
  return out
}
