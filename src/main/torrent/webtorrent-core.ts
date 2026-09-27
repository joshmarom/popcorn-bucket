import { app } from 'electron'
import type { Readable } from 'node:stream'
import { join } from 'node:path'

export const STREAM_PATH = '/popcorn-webtorrent'

export type WtFile = {
  name: string
  path: string
  length: number
  /** Bytes fetched for this file (WebTorrent computed getter). */
  downloaded: number
  progress: number
  select?: (priority?: number) => void
  /** Present on WebTorrent `File` instances (not on persisted snapshots). */
  createReadStream?: (opts?: { start?: number; end?: number }) => Readable
}

export type WtTorrent = {
  infoHash: string
  name?: string
  ready: boolean
  done: boolean
  destroyed?: boolean
  paused?: boolean
  length: number
  downloaded: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  progress: number
  files: WtFile[]
  pause?: () => void
  resume?: () => void
  once: (ev: string, fn: (err?: Error) => void) => void
  on: (ev: string, fn: () => void) => void
}

export type WebTorrentClient = {
  ready: boolean
  once: (ev: string, fn: () => void) => void
  add: (magnet: string, opts: Record<string, unknown>, ontorrent?: (t: unknown) => void) => unknown
  remove: (id: string | unknown, opts?: Record<string, unknown>) => Promise<void>
  destroy: (cb?: () => void) => void
  createServer: (opts: Record<string, unknown>, force: string) => WtHttpServer
}

export type WtHttpServer = {
  listen: (port: number, host: string, cb: () => void) => void
  address: () => { port: number; address?: string; family?: string } | string | null
}

let WebTorrentCtor: (new (opts?: object) => WebTorrentClient) | null = null
let client: WebTorrentClient | null = null
let httpServer: WtHttpServer | null = null
let httpPort: number | null = null

async function getWebTorrentConstructor(): Promise<new (opts?: object) => WebTorrentClient> {
  if (WebTorrentCtor) {
    return WebTorrentCtor
  }
  const mod = await import('webtorrent')
  const Ctor = (mod as { default?: new (opts?: object) => WebTorrentClient }).default
  if (!Ctor) {
    throw new Error('webtorrent package has no default export')
  }
  WebTorrentCtor = Ctor
  return Ctor
}

/** Root folder for torrent payload files (under the OS Downloads directory). */
export function baseDownloadDir(): string {
  return join(app.getPath('downloads'), 'Popcorn Bucket')
}

export function getClientIfExists(): WebTorrentClient | null {
  return client
}

export async function getReadyClient(): Promise<WebTorrentClient> {
  const WT = await getWebTorrentConstructor()
  if (!client) {
    client = new WT()
  }
  if (client.ready) {
    return client
  }
  await new Promise<void>((resolve) => {
    client!.once('ready', () => resolve())
  })
  return client!
}

export async function ensureHttpServer(c: WebTorrentClient): Promise<number> {
  if (httpPort != null && httpServer) {
    return httpPort
  }
  const srv = c.createServer(
    {
      origin: '*',
      pathname: STREAM_PATH
    },
    'node'
  )
  httpServer = srv
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Stream server listen timeout')), 15_000)
    srv.listen(0, '127.0.0.1', () => {
      clearTimeout(to)
      resolve()
    })
  })
  const addr = srv.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('Stream server has no address')
  }
  const port = addr.port
  httpPort = port
  return port
}

export function pickPlayableFile(torrent: WtTorrent): WtFile | null {
  if (!torrent.files?.length) return null
  const videoRe = /\.(mp4|mkv|webm|m4v|mov|avi)$/i
  const videos = torrent.files.filter((f) => videoRe.test(f.name) || videoRe.test(f.path))
  const pool = videos.length > 0 ? videos : torrent.files
  return [...pool].sort((a, b) => b.length - a.length)[0] ?? null
}

const SUBTITLE_FILE_RE = /\.(srt|vtt|ssa|ass)$/i

export type TorrentSidecarSubtitle = {
  path: string
  displayName: string
  format: 'srt' | 'vtt' | 'ssa' | 'ass'
}

/** Lists subtitle/caption files in the torrent (sidecar), excluding the main video path. */
export function listTorrentSidecarSubtitles(
  torrent: WtTorrent,
  videoFilePath: string
): TorrentSidecarSubtitle[] {
  if (!torrent.files?.length) return []
  const out: TorrentSidecarSubtitle[] = []
  for (const f of torrent.files) {
    if (f.path === videoFilePath) continue
    const name = (f.name || f.path).trim()
    const m = name.match(SUBTITLE_FILE_RE)
    if (!m) continue
    const ext = m[1].toLowerCase()
    if (ext !== 'srt' && ext !== 'vtt' && ext !== 'ssa' && ext !== 'ass') continue
    out.push({ path: f.path, displayName: name, format: ext })
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return out
}

/**
 * Use `localhost` (not `127.0.0.1`) in URLs handed to the renderer so they match the Vite
 * dev origin and avoid Chrome/Electron private-network + cross-origin manifest fetch failures.
 */
export function streamLoopbackHttpOrigin(port: number): string {
  return `http://localhost:${port}`
}

export function buildStreamUrl(infoHash: string, filePath: string, port: number): string {
  const hash = String(infoHash).toLowerCase()
  const segments = filePath.split('/').map((p) => encodeURIComponent(p))
  return `${streamLoopbackHttpOrigin(port)}${STREAM_PATH}/${hash}/${segments.join('/')}`
}

/** Bytes needed on the chosen file before we enable Play (start of stream + moov headroom). */
export function playbackReadyBytes(playFile: WtFile): number {
  const len = playFile.length || 0
  if (len <= 0) return 0
  const minAbs = 3 * 1024 * 1024
  const minFrac = 0.04 * len
  return Math.min(len, Math.max(minAbs, minFrac))
}

export function shutdownWebTorrentCore(): void {
  httpServer = null
  httpPort = null
  if (client) {
    try {
      client.destroy(() => {})
    } catch {
      /* ignore */
    }
    client = null
  }
  WebTorrentCtor = null
}
