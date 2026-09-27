import { protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { baseDownloadDir } from './torrent/webtorrent-core'

export const LOCAL_MEDIA_SCHEME = 'pb-media'
const HOST = 'local'

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.ass': 'text/plain; charset=utf-8',
  '.ssa': 'text/plain; charset=utf-8'
}

/** Must run before `app.whenReady()`. */
export function registerLocalMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

/** URL for a file under the download folder, or null when the path is outside it. */
export function localMediaUrl(absPath: string): string | null {
  const rel = relative(baseDownloadDir(), absPath)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  const segments = rel.split(sep).map((p) => encodeURIComponent(p))
  return `${LOCAL_MEDIA_SCHEME}://${HOST}/${segments.join('/')}`
}

function resolveRequestPath(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname !== HOST) return null
  const segments = u.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s))
  if (segments.length === 0 || segments.some((s) => s === '..' || s.includes(sep))) return null
  const base = baseDownloadDir()
  const abs = join(base, ...segments)
  const rel = relative(base, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return abs
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end }
}

export function installLocalMediaProtocol(): void {
  protocol.handle(LOCAL_MEDIA_SCHEME, (request) => {
    const abs = resolveRequestPath(request.url)
    if (!abs) return new Response('Not found', { status: 404 })
    let size: number
    try {
      const st = statSync(abs)
      if (!st.isFile()) return new Response('Not found', { status: 404 })
      size = st.size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const headers: Record<string, string> = {
      'Content-Type': MIME_BY_EXT[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    }
    if (size === 0) return new Response(null, { status: 200, headers })
    const rangeHeader = request.headers.get('range')
    const range = parseRange(rangeHeader, size)
    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${size}` }
      })
    }
    const start = range?.start ?? 0
    const end = range?.end ?? size - 1
    const body = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream
    headers['Content-Length'] = String(end - start + 1)
    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`
      return new Response(body, { status: 206, headers })
    }
    return new Response(body, { status: 200, headers })
  })
}
