import { createHash } from 'crypto'
import { parseReleaseTitle } from '@shared/release-info'
import {
  withReleaseInfo,
  type RawTorrentSource,
  type TorrentProviderError,
  type TorrentSearchResponse,
  type TorrentSource
} from '@shared/torrent'
import type { LibraryDb } from './db'

export const TORRENT_SEARCH_FRESH_MS = 5 * 24 * 60 * 60 * 1000

type TorrentRow = {
  info_hash: string
  provider: string
  title: string
  magnet: string | null
  size: string | null
  seeders: number
  leechers: number
  torrent_file_url: string | null
  details_url: string | null
  upload_date: string | null
}

type SearchRow = {
  fetched_at: number
  errors_json: string
}

export function torrentInfoHash(
  row: Pick<RawTorrentSource, 'magnetUri' | 'title' | 'providerName' | 'size'>
): string {
  const magnet = row.magnetUri ?? ''
  const hex = /xt=urn:btih:([a-f0-9]{40})/i.exec(magnet)
  if (hex?.[1]) return hex[1].toLowerCase()
  const base32 = /xt=urn:btih:([a-z2-7]{32})/i.exec(magnet)
  if (base32?.[1]) return base32[1].toLowerCase()
  return `syn:${createHash('sha1')
    .update(`${row.providerName}\0${row.title}\0${row.size ?? ''}\0${magnet}`)
    .digest('hex')}`
}

function movieIdForCacheKey(db: LibraryDb, cacheKey: string): number | null {
  const imdbId = cacheKey.split('::')[0] ?? ''
  if (!/^tt\d+$/.test(imdbId)) return null
  const row = db.prepare('SELECT tmdb_id FROM movies WHERE imdb_id = ?').get(imdbId) as
    | { tmdb_id: number }
    | undefined
  return row?.tmdb_id ?? null
}

function parseErrors(json: string): TorrentProviderError[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const provider = (entry as { provider?: unknown }).provider
      const message = (entry as { message?: unknown }).message
      if (typeof provider !== 'string' || typeof message !== 'string') return []
      return [{ provider, message }]
    })
  } catch {
    return []
  }
}

export function writeTorrentSearch(
  db: LibraryDb,
  cacheKey: string,
  response: Extract<TorrentSearchResponse, { ok: true }>,
  fetchedAt = Date.now()
): void {
  const movieId = movieIdForCacheKey(db, cacheKey)
  const seen = new Set<string>()
  const rows: { infoHash: string; source: TorrentSource }[] = []
  for (const source of response.results) {
    const infoHash = torrentInfoHash(source)
    if (seen.has(infoHash)) continue
    seen.add(infoHash)
    rows.push({ infoHash, source })
  }

  const run = db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO torrents (
         info_hash, provider, title, magnet, size, seeders, leechers,
         torrent_file_url, details_url, upload_date,
         resolution, source, codec, hdr, release_year, season, episode, season_pack,
         movie_id, fetched_at
       ) VALUES (
         @infoHash, @provider, @title, @magnet, @size, @seeders, @leechers,
         @torrentFileUrl, @detailsUrl, @uploadDate,
         @resolution, @source, @codec, @hdr, @releaseYear, @season, @episode, @seasonPack,
         @movieId, @fetchedAt
       )
       ON CONFLICT(info_hash) DO UPDATE SET
         provider = excluded.provider,
         title = excluded.title,
         magnet = excluded.magnet,
         size = excluded.size,
         seeders = excluded.seeders,
         leechers = excluded.leechers,
         torrent_file_url = excluded.torrent_file_url,
         details_url = excluded.details_url,
         upload_date = excluded.upload_date,
         resolution = excluded.resolution,
         source = excluded.source,
         codec = excluded.codec,
         hdr = excluded.hdr,
         release_year = excluded.release_year,
         season = excluded.season,
         episode = excluded.episode,
         season_pack = excluded.season_pack,
         movie_id = COALESCE(excluded.movie_id, torrents.movie_id),
         fetched_at = excluded.fetched_at`
    )
    for (const row of rows) {
      const release = row.source.release ?? parseReleaseTitle(row.source.title)
      upsert.run({
        infoHash: row.infoHash,
        provider: row.source.providerName,
        title: row.source.title,
        magnet: row.source.magnetUri,
        size: row.source.size,
        seeders: row.source.seeders,
        leechers: row.source.leechers,
        torrentFileUrl: row.source.torrentFileUrl,
        detailsUrl: row.source.detailsUrl,
        uploadDate: row.source.uploadDate,
        resolution: release.resolution,
        source: release.source,
        codec: release.codec,
        hdr: release.hdr ? 1 : 0,
        releaseYear: release.year,
        season: release.season,
        episode: release.episode,
        seasonPack: release.seasonPack ? 1 : 0,
        movieId,
        fetchedAt
      })
    }

    db.prepare(
      `INSERT INTO torrent_searches (cache_key, fetched_at, errors_json)
       VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         fetched_at = excluded.fetched_at,
         errors_json = excluded.errors_json`
    ).run(cacheKey, fetchedAt, JSON.stringify(response.errors))

    db.prepare('DELETE FROM torrent_search_hits WHERE cache_key = ?').run(cacheKey)
    const insertHit = db.prepare(
      `INSERT INTO torrent_search_hits (cache_key, info_hash, position)
       VALUES (?, ?, ?)`
    )
    rows.forEach((row, position) => {
      insertHit.run(cacheKey, row.infoHash, position)
    })
  })
  run()
}

export function readTorrentSearch(
  db: LibraryDb,
  cacheKey: string,
  now = Date.now()
): TorrentSearchResponse | null {
  const search = db
    .prepare('SELECT fetched_at, errors_json FROM torrent_searches WHERE cache_key = ?')
    .get(cacheKey) as SearchRow | undefined
  if (!search) return null
  if (now - search.fetched_at > TORRENT_SEARCH_FRESH_MS) return null

  const torrents = db
    .prepare(
      `SELECT t.info_hash, t.provider, t.title, t.magnet, t.size, t.seeders, t.leechers,
              t.torrent_file_url, t.details_url, t.upload_date
       FROM torrent_search_hits h
       JOIN torrents t ON t.info_hash = h.info_hash
       WHERE h.cache_key = ?
       ORDER BY h.position ASC`
    )
    .all(cacheKey) as TorrentRow[]

  const results = torrents.map((row) =>
    withReleaseInfo({
      title: row.title,
      providerName: row.provider,
      size: row.size,
      seeders: row.seeders,
      leechers: row.leechers,
      magnetUri: row.magnet,
      torrentFileUrl: row.torrent_file_url,
      detailsUrl: row.details_url,
      uploadDate: row.upload_date
    })
  )

  return {
    ok: true,
    results,
    errors: parseErrors(search.errors_json),
    cached: true,
    cachedAtMs: search.fetched_at
  }
}

/** Attach torrents saved under this IMDb id once the movie row exists. */
export function linkTorrentsForImdb(db: LibraryDb, imdbId: string, tmdbId: number): void {
  db.prepare(
    `UPDATE torrents
     SET movie_id = ?
     WHERE movie_id IS NULL
       AND info_hash IN (
         SELECT info_hash FROM torrent_search_hits
         WHERE cache_key LIKE ?
       )`
  ).run(tmdbId, `${imdbId}::%`)
}
