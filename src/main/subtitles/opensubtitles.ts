import { app } from 'electron'
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const API = 'https://api.opensubtitles.com/api/v1'
const USER_AGENT = `PopcornBucket v${app.getVersion()}`
const TIMEOUT_MS = 10_000
const HASH_CHUNK = 64 * 1024

export function subtitleCacheRoot(): string {
  return join(app.getPath('userData'), 'subtitles')
}

/**
 * The OpenSubtitles "moviehash": file size plus the 64-bit little-endian word sums of the first
 * and last 64 KB. Returns null when the file is too small or unreadable.
 */
export function computeMovieHash(absPath: string): string | null {
  let fd: number | null = null
  try {
    fd = openSync(absPath, 'r')
    const size = fstatSync(fd).size
    if (size < HASH_CHUNK * 2) return null
    const head = Buffer.alloc(HASH_CHUNK)
    const tail = Buffer.alloc(HASH_CHUNK)
    readSync(fd, head, 0, HASH_CHUNK, 0)
    readSync(fd, tail, 0, HASH_CHUNK, size - HASH_CHUNK)
    return movieHashFromChunks(size, head, tail)
  } catch {
    return null
  } finally {
    if (fd != null) closeSync(fd)
  }
}

export function movieHashFromChunks(size: number, head: Buffer, tail: Buffer): string {
  const mask = (1n << 64n) - 1n
  let hash = BigInt(size)
  for (const chunk of [head, tail]) {
    for (let i = 0; i + 8 <= chunk.length; i += 8) {
      hash = (hash + chunk.readBigUInt64LE(i)) & mask
    }
  }
  return hash.toString(16).padStart(16, '0')
}

type SearchHit = {
  attributes?: {
    language?: string
    moviehash_match?: boolean
    download_count?: number
    files?: { file_id?: number; file_name?: string }[]
  }
}

async function osFetch(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      signal: ac.signal,
      headers: {
        'Api-Key': apiKey,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {})
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Finds and downloads the best subtitle for a movie in `language`, caching it on disk.
 * Prefers an exact file-hash match, then the most downloaded. Returns the cached file path, or
 * null when nothing suitable was found or the service is unreachable.
 */
export async function fetchSubtitleContent(params: {
  apiKey: string
  imdbId: string
  language: string
  movieHash: string | null
  episode?: { season: number; episode: number }
}): Promise<{ fileId: number; content: string } | null> {
  const imdbNumeric = params.imdbId.replace(/^tt/i, '').replace(/^0+/, '')
  const query = new URLSearchParams({ languages: params.language })
  if (params.episode) {
    query.set('parent_imdb_id', imdbNumeric)
    query.set('season_number', String(params.episode.season))
    query.set('episode_number', String(params.episode.episode))
  } else {
    query.set('imdb_id', imdbNumeric)
  }
  if (params.movieHash) query.set('moviehash', params.movieHash)
  try {
    const res = await osFetch(params.apiKey, `/subtitles?${query.toString()}`)
    if (!res.ok) return null
    const body = (await res.json()) as { data?: SearchHit[] }
    const hits = (body.data ?? []).filter(
      (h) => h.attributes?.language === params.language && h.attributes.files?.[0]?.file_id
    )
    hits.sort(
      (a, b) =>
        Number(Boolean(b.attributes?.moviehash_match)) -
          Number(Boolean(a.attributes?.moviehash_match)) ||
        (b.attributes?.download_count ?? 0) - (a.attributes?.download_count ?? 0)
    )
    const fileId = hits[0]?.attributes?.files?.[0]?.file_id
    if (!fileId) return null

    const dl = await osFetch(params.apiKey, '/download', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' })
    })
    if (!dl.ok) return null
    const link = ((await dl.json()) as { link?: string }).link
    if (!link || !link.startsWith('https://')) return null
    const file = await fetch(link, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!file.ok) return null
    const text = await file.text()
    if (!text.trim()) return null
    return { fileId, content: text }
  } catch {
    return null
  }
}

export async function fetchSubtitle(params: {
  apiKey: string
  movieId: number
  imdbId: string
  language: string
  movieHash: string | null
  /** For TV: `imdbId` is the show's id and these pick the episode. */
  episode?: { season: number; episode: number }
}): Promise<string | null> {
  const dir = join(subtitleCacheRoot(), String(params.movieId))
  const cached = await findCachedSubtitle(dir, params.language)
  if (cached) return cached
  const downloaded = await fetchSubtitleContent(params)
  if (!downloaded) return null
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `opensubtitles.${params.language}.${downloaded.fileId}.srt`)
  await writeFile(out, downloaded.content, 'utf8')
  return out
}

export async function findCachedSubtitle(dir: string, language: string): Promise<string | null> {
  if (!existsSync(dir)) return null
  const names = await readdir(dir).catch(() => [] as string[])
  const hit = names.find((n) => n.startsWith(`opensubtitles.${language}.`) && n.endsWith('.srt'))
  return hit ? join(dir, hit) : null
}
