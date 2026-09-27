import { protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { basename, extname, isAbsolute, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'

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

/** Folders the protocol may serve from (download folders, subtitle cache). */
let allowedRoots: () => string[] = () => []

export function setLocalMediaRoots(roots: () => string[]): void {
  allowedRoots = roots
}

function isUnderAllowedRoot(abs: string): boolean {
  return allowedRoots().some((root) => {
    const rel = relative(resolve(root), abs)
    return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
  })
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

/**
 * URL for a file under an allowed root, or null otherwise. The path travels base64url-encoded;
 * the file name is repeated at the end so players can infer the type from the extension.
 */
export function localMediaUrl(absPath: string): string | null {
  const abs = resolve(absPath)
  if (!isUnderAllowedRoot(abs)) return null
  const token = Buffer.from(abs, 'utf8').toString('base64url')
  return `${LOCAL_MEDIA_SCHEME}://${HOST}/${token}/${encodeURIComponent(basename(abs))}`
}

function resolveRequestPath(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname !== HOST) return null
  const [token, name] = u.pathname.split('/').filter(Boolean)
  if (!token || !name) return null
  let abs: string
  try {
    abs = resolve(Buffer.from(token, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (basename(abs) !== decodeURIComponent(name)) return null
  return isUnderAllowedRoot(abs) ? abs : null
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
