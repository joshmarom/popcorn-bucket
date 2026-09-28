import {
  isSafeTorrentDetailsUrl,
  isValidMagnetUri,
  type RawTorrentSource,
  type TorrentQualityInfo
} from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { formatBytes } from '../format-bytes'
import { magnetFromInfoHash } from '../magnet-from-hash'
import { eztvQueryTarget } from './eztv'
import { TORRENTCLAW_ORIGIN, hasUsableTorrentClawKey, tcFetchJson } from '../../torrentclaw/client'
import {
  tcSearchResponseSchema,
  type TcSearchResult,
  type TcTorrent
} from '../../torrentclaw/schemas'

const PROVIDER = 'TorrentClaw'
const RESULT_LIMIT = 5

function sizeBytesOf(t: TcTorrent): number | null {
  const n = typeof t.sizeBytes === 'string' ? Number(t.sizeBytes) : t.sizeBytes
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function qualityOf(t: TcTorrent): TorrentQualityInfo {
  const hdr = t.videoInfo?.hdr?.trim() || t.hdrType?.trim() || null
  return {
    score: t.qualityScore ?? null,
    verified: t.scanStatus === 'success',
    hdr,
    videoCodec: t.videoInfo?.codec?.trim() || t.codec?.trim() || null,
    videoHeight: t.videoInfo?.height ?? null,
    audioTracks: (t.audioTracks ?? []).map((a) => ({
      lang: a.lang ?? null,
      codec: a.codec ?? null,
      channels: a.channels ?? null
    })),
    subtitleLangs: t.subtitleLanguages ?? [],
    languages: t.languages ?? [],
    releaseGroup: t.releaseGroup ?? null
  }
}

export function torrentClawRow(t: TcTorrent, result: TcSearchResult): RawTorrentSource | null {
  const title = t.rawTitle.trim()
  if (!title) return null
  const magnetUri =
    (t.magnetUrl && isValidMagnetUri(t.magnetUrl) ? t.magnetUrl : null) ??
    (t.infoHash ? magnetFromInfoHash(title, t.infoHash) : null)
  if (!magnetUri) return null

  const bytes = sizeBytesOf(t)
  const details = result.contentUrl ? `${TORRENTCLAW_ORIGIN}${result.contentUrl}` : null
  const torrentFile = t.torrentUrl?.startsWith('/') ? `${TORRENTCLAW_ORIGIN}${t.torrentUrl}` : null
  return {
    title,
    providerName: PROVIDER,
    size: bytes != null ? formatBytes(bytes) : null,
    seeders: Math.max(0, Math.floor(t.seeders)),
    leechers: Math.max(0, Math.floor(t.leechers)),
    magnetUri,
    torrentFileUrl: torrentFile && isSafeTorrentDetailsUrl(torrentFile) ? torrentFile : null,
    detailsUrl: details && isSafeTorrentDetailsUrl(details) ? details : null,
    uploadDate: t.uploadedAt ? t.uploadedAt.slice(0, 10) : null,
    quality: qualityOf(t),
    ...(t.season != null ? { tvEpisode: { season: t.season, episode: t.episode ?? null } } : {})
  }
}

/** "Title 2010" → title and year; "Show S01E02" → show name. */
export function splitQuery(query: string): { text: string; year: number | null } {
  const noEpisode = query.replace(/\bs\d{1,2}(e\d{1,3})?\b/i, ' ')
  const m = /\s((?:19|20)\d{2})\s*$/.exec(noEpisode)
  const year = m ? Number(m[1]) : null
  const text = (m ? noEpisode.slice(0, m.index) : noEpisode).replace(/\s+/g, ' ').trim()
  return { text, year }
}

async function searchOnce(
  params: Record<string, string | number | undefined>,
  signal: AbortSignal
): Promise<TcSearchResult[]> {
  const res = await tcFetchJson('/search', params, {
    schema: tcSearchResponseSchema,
    auth: 'require',
    signal
  })
  return res.results
}

export async function searchTorrentClaw(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<RawTorrentSource[]> {
  // Anonymous responses carry no magnets, so there is nothing to add without a key.
  if (!hasUsableTorrentClawKey()) return []

  const target = eztvQueryTarget(ctx.query)
  const { text, year } = splitQuery(ctx.query)
  if (!ctx.imdbId && !text) return []

  const base: Record<string, string | number | undefined> = {
    type: target ? 'show' : 'movie',
    limit: RESULT_LIMIT,
    ...(ctx.imdbId
      ? { imdbid: ctx.imdbId }
      : { q: text, year_min: year ?? undefined, year_max: year ?? undefined })
  }

  // "Show S02" returns season packs; "Show S02E05" returns that episode's releases. The show page
  // runs both searches, so each maps to one request here.
  const params = target
    ? { ...base, season: target.season, episode: target.episode ?? undefined }
    : base
  const results = await searchOnce(params, signal)

  const out: RawTorrentSource[] = []
  for (const result of results) {
    if (result.contentType !== base.type) continue
    for (const t of result.torrents ?? []) {
      const row = torrentClawRow(t, result)
      if (row) out.push(row)
    }
  }
  return out
}
