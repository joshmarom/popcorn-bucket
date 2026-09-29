import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'hono'
import { getLibrary } from '../../src/main/library/db'
import {
  imdbIdForTmdbTitle,
  markMediaError,
  markMediaFetched,
  mediaAssetTmdbId,
  pendingMediaAssets,
  type PendingMediaAsset
} from '../../src/main/library/media-assets'
import {
  normalizeTmdbFilePath,
  torrentClawCdnUrl,
  torrentClawPosterProxyUrl,
  tmdbCdnUrl,
  type MediaKind,
  type MediaSize,
  MEDIA_KINDS,
  MEDIA_SIZES
} from '../../src/shared/media-urls'
import { serverSettings } from './secrets'

const inflight = new Map<string, Promise<string | null>>()

export function mediaRoot(): string {
  return process.env.POPCORN_MEDIA_DIR?.trim() || join(homedir(), 'popcorn-media')
}

function isKind(value: string): value is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(value)
}

function isSize(value: string): value is MediaSize {
  return (MEDIA_SIZES as readonly string[]).includes(value)
}

function assetKey(asset: PendingMediaAsset): string {
  return `${asset.kind}:${asset.size}:${asset.filePath}`
}

function relpath(asset: PendingMediaAsset): string {
  const file = asset.filePath.replace(/^\//, '')
  return join('tmdb', asset.kind, asset.size, file)
}

function absPath(asset: PendingMediaAsset): string {
  return join(mediaRoot(), relpath(asset))
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/*', 'User-Agent': 'popcorn-bucket/media' },
      signal: AbortSignal.timeout(20_000)
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !type.startsWith('image/') && type !== 'application/octet-stream') return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 32 ? buf : null
  } catch {
    return null
  }
}

async function fetchOmdbPoster(tmdbId: number | null): Promise<Buffer | null> {
  if (tmdbId == null) return null
  const imdb = imdbIdForTmdbTitle(getLibrary(), tmdbId)
  let apiKey = process.env.OMDB_API_KEY?.trim() ?? ''
  if (!apiKey) {
    try {
      apiKey = serverSettings().omdbApiKey.trim()
    } catch {
      apiKey = ''
    }
  }
  if (!imdb || !apiKey) return null
  try {
    const meta = new URL('https://www.omdbapi.com/')
    meta.searchParams.set('i', imdb)
    meta.searchParams.set('apikey', apiKey)
    meta.searchParams.set('plot', 'short')
    const json = (await fetch(meta, { signal: AbortSignal.timeout(12_000) }).then((res) =>
      res.ok ? res.json() : null
    )) as { Poster?: string } | null
    const poster = json?.Poster?.trim()
    if (!poster || poster === 'N/A' || !/^https?:\/\//i.test(poster)) return null
    return download(poster)
  } catch {
    return null
  }
}

async function fetchBytes(asset: PendingMediaAsset): Promise<{ buf: Buffer; source: string } | null> {
  const sources: { url: string; source: string }[] = [
    { url: tmdbCdnUrl(asset.size, asset.filePath), source: 'tmdb' },
    { url: torrentClawCdnUrl(asset.size, asset.filePath), source: 'torrentclaw' },
    { url: torrentClawPosterProxyUrl(asset.size, asset.filePath), source: 'torrentclaw' }
  ]
  for (const { url, source } of sources) {
    const buf = await download(url)
    if (buf) return { buf, source }
  }
  if (asset.kind === 'poster') {
    const buf = await fetchOmdbPoster(asset.tmdbId)
    if (buf) return { buf, source: 'omdb' }
  }
  return null
}

async function writeAsset(asset: PendingMediaAsset): Promise<string | null> {
  const dest = absPath(asset)
  if (await fileExists(dest)) {
    markMediaFetched(getLibrary(), asset, {
      sha256: '',
      relpath: relpath(asset),
      source: 'disk'
    })
    return dest
  }
  const got = await fetchBytes(asset)
  if (!got) {
    markMediaError(getLibrary(), asset, 'fetch failed')
    return null
  }
  await mkdir(join(dest, '..'), { recursive: true })
  await writeFile(dest, got.buf)
  markMediaFetched(getLibrary(), asset, {
    sha256: createHash('sha256').update(got.buf).digest('hex'),
    relpath: relpath(asset),
    source: got.source
  })
  return dest
}

export async function ensureMediaFile(asset: PendingMediaAsset): Promise<string | null> {
  const key = assetKey(asset)
  const existing = inflight.get(key)
  if (existing) return existing
  const job = writeAsset(asset).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, job)
  return job
}

export async function drainMediaQueue(limit = 40): Promise<number> {
  const pending = pendingMediaAssets(getLibrary(), limit)
  let ok = 0
  for (const asset of pending) {
    const path = await ensureMediaFile(asset)
    if (path) ok += 1
  }
  return ok
}

export async function handleMediaRequest(c: Context): Promise<Response> {
  const kind = c.req.param('kind') ?? ''
  const size = c.req.param('size') ?? ''
  const file = c.req.param('file') ?? ''
  const filePath = normalizeTmdbFilePath(`/${file}`)
  if (!isKind(kind) || !isSize(size) || !filePath) {
    return c.body('Not found', 404)
  }
  const asset: PendingMediaAsset = {
    tmdbId: mediaAssetTmdbId(getLibrary(), { kind, size, filePath }),
    kind,
    size,
    filePath
  }
  const path = await ensureMediaFile(asset)
  if (!path) return c.body('Not found', 404)
  const ext = filePath.split('.').pop()?.toLowerCase()
  const type =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  const buf = await readFile(path)
  return c.body(buf, 200, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=31536000, immutable'
  })
}
