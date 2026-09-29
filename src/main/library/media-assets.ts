import {
  normalizeTmdbFilePath,
  parseTmdbImageUrl,
  type MediaKind,
  type MediaSize
} from '@shared/media-urls'
import type { LibraryDb } from './db'

export type EnqueueMediaInput = {
  tmdbId?: number | null
  posterUrl?: string | null
  backdropUrl?: string | null
  stillUrls?: string[]
  profileUrls?: string[]
}

const POSTER_SIZES: MediaSize[] = ['w185', 'w500']
const BACKDROP_SIZES: MediaSize[] = ['w1280']
const MAX_STILLS = 5

function sizesFor(kind: MediaKind, size: MediaSize): MediaSize[] {
  const extra = kind === 'poster' ? POSTER_SIZES : kind === 'backdrop' ? BACKDROP_SIZES : []
  return [...new Set([size, ...extra])]
}

function insertAsset(
  db: LibraryDb,
  row: {
    tmdbId: number | null
    kind: MediaKind
    size: MediaSize
    filePath: string
  }
): void {
  const stmt = db.prepare(
    `INSERT INTO media_assets (tmdb_id, kind, file_path, size)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (kind, size, file_path) DO UPDATE SET
       tmdb_id = COALESCE(excluded.tmdb_id, media_assets.tmdb_id)`
  )
  for (const size of sizesFor(row.kind, row.size)) {
    stmt.run(row.tmdbId, row.kind, row.filePath, size)
  }
}

function enqueueParsed(
  db: LibraryDb,
  tmdbId: number | null,
  url: string | null | undefined,
  kindHint?: MediaKind
): void {
  if (!url) return
  const parsed = parseTmdbImageUrl(url, kindHint)
  if (!parsed) return
  insertAsset(db, { tmdbId, ...parsed })
}

/** Queue poster/backdrop/still/profile files so the media route or harvest job can fetch them. */
export function enqueueMediaFromUrls(db: LibraryDb, input: EnqueueMediaInput): void {
  const tmdbId = input.tmdbId ?? null
  enqueueParsed(db, tmdbId, input.posterUrl, 'poster')
  enqueueParsed(db, tmdbId, input.backdropUrl, 'backdrop')
  for (const url of (input.stillUrls ?? []).slice(0, MAX_STILLS)) {
    enqueueParsed(db, tmdbId, url, 'still')
  }
  for (const url of input.profileUrls ?? []) enqueueParsed(db, tmdbId, url, 'profile')
}

export function stillUrlsForMovie(db: LibraryDb, tmdbId: number): string[] {
  const rows = db
    .prepare(
      `SELECT file_path, size FROM media_assets
       WHERE tmdb_id = ? AND kind IN ('backdrop', 'still')
       ORDER BY CASE kind WHEN 'backdrop' THEN 0 ELSE 1 END, id`
    )
    .all(tmdbId) as { file_path: string; size: string }[]
  const out: string[] = []
  for (const row of rows) {
    const filePath = normalizeTmdbFilePath(row.file_path)
    if (!filePath || out.includes(filePath)) continue
    out.push(`https://image.tmdb.org/t/p/${row.size}${filePath}`)
    if (out.length >= MAX_STILLS) break
  }
  return out
}

export type PendingMediaAsset = {
  tmdbId: number | null
  kind: MediaKind
  size: MediaSize
  filePath: string
}

export function pendingMediaAssets(db: LibraryDb, limit: number): PendingMediaAsset[] {
  const rows = db
    .prepare(
      `SELECT tmdb_id, kind, size, file_path FROM media_assets
       WHERE fetched_at IS NULL
       ORDER BY id
       LIMIT ?`
    )
    .all(limit) as { tmdb_id: number | null; kind: string; size: string; file_path: string }[]
  return rows.flatMap((row) => {
    const filePath = normalizeTmdbFilePath(row.file_path)
    if (!filePath) return []
    return [
      {
        tmdbId: row.tmdb_id,
        kind: row.kind as MediaKind,
        size: row.size as MediaSize,
        filePath
      }
    ]
  })
}

export function mediaAssetTmdbId(
  db: LibraryDb,
  asset: Pick<PendingMediaAsset, 'kind' | 'size' | 'filePath'>
): number | null {
  const row = db
    .prepare(
      `SELECT tmdb_id FROM media_assets
       WHERE kind = ? AND size = ? AND file_path = ?`
    )
    .get(asset.kind, asset.size, asset.filePath) as { tmdb_id: number | null } | undefined
  return row?.tmdb_id ?? null
}

export function imdbIdForTmdbTitle(db: LibraryDb, tmdbId: number): string | null {
  const movie = db.prepare('SELECT imdb_id FROM movies WHERE tmdb_id = ?').get(tmdbId) as
    | { imdb_id: string | null }
    | undefined
  if (movie?.imdb_id) return movie.imdb_id
  const show = db.prepare('SELECT imdb_id FROM shows WHERE tmdb_id = ?').get(tmdbId) as
    | { imdb_id: string | null }
    | undefined
  return show?.imdb_id ?? null
}

export function markMediaFetched(
  db: LibraryDb,
  asset: PendingMediaAsset,
  result: { sha256: string; relpath: string; source: string }
): void {
  db.prepare(
    `INSERT INTO media_assets (
       tmdb_id, kind, file_path, size, sha256, local_relpath, source, fetched_at, last_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT (kind, size, file_path) DO UPDATE SET
       tmdb_id = COALESCE(excluded.tmdb_id, media_assets.tmdb_id),
       sha256 = excluded.sha256,
       local_relpath = excluded.local_relpath,
       source = excluded.source,
       fetched_at = excluded.fetched_at,
       last_error = NULL`
  ).run(
    asset.tmdbId,
    asset.kind,
    asset.filePath,
    asset.size,
    result.sha256,
    result.relpath,
    result.source,
    Date.now()
  )
}

export function markMediaError(db: LibraryDb, asset: PendingMediaAsset, error: string): void {
  db.prepare(
    `UPDATE media_assets SET last_error = ? WHERE kind = ? AND size = ? AND file_path = ?`
  ).run(error.slice(0, 400), asset.kind, asset.size, asset.filePath)
}
