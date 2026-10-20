import { app } from 'electron'
import type { Readable } from 'node:stream'
import { isAbsolute, join } from 'node:path'
import type { Preferences } from '@shared/preferences'
import { parseReleaseTitle } from '@shared/release-info'
import { getPreferences } from '../preferences-store'

export const STREAM_PATH = '/popcorn-webtorrent'

export type WtFile = {
  name: string
  path: string
  length: number
  /** Byte offset of this file within the whole torrent. */
  offset?: number
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
  pieceLength?: number
  bitfield?: { get: (index: number) => boolean }
  /** Prioritize a piece range (inclusive). */
  select?: (start: number, end: number, priority?: number) => void
  /** Internal WebTorrent selection allowing `isStreamSelection` so sub-ranges aren't swallowed by `Selections.concatenate`. */
  _select?: (
    start: number,
    end: number,
    priority?: number,
    notify?: (() => void) | null,
    isStreamSelection?: boolean
  ) => void
  critical?: (start: number, end: number) => void
  pause?: () => void
  resume?: () => void
  once: (ev: string, fn: (err?: Error) => void) => void
  on: (ev: string, fn: () => void) => void
  removeListener?: (ev: string, fn: () => void) => void
}

export type WebTorrentClient = {
  ready: boolean
  once: (ev: string, fn: () => void) => void
  add: (magnet: string, opts: Record<string, unknown>, ontorrent?: (t: unknown) => void) => unknown
  remove: (id: string | unknown, opts?: Record<string, unknown>) => Promise<void>
  destroy: (cb?: () => void) => void
  createServer: (opts: Record<string, unknown>, force: string) => WtHttpServer
  throttleDownload?: (rate: number) => void
  throttleUpload?: (rate: number) => void
}

export type WtHttpServer = {
  listen: (port: number, host: string, cb: () => void) => void
  address: () => { port: number; address?: string; family?: string } | string | null
  server?: {
    on: (
      ev: 'request',
      fn: (req: unknown, res: { setHeader: (name: string, value: string) => void }) => void
    ) => void
  }
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

export function defaultDownloadDir(): string {
  return join(app.getPath('downloads'), 'Popcorn Bucket')
}

/** Root folder for new downloads: the user's chosen folder, else `Downloads/Popcorn Bucket`. */
export function baseDownloadDir(): string {
  const chosen = getPreferences().downloadDir.trim()
  return chosen && isAbsolute(chosen) ? chosen : defaultDownloadDir()
}

export function getClientIfExists(): WebTorrentClient | null {
  return client
}

/** WebTorrent takes bytes per second, with -1 meaning unlimited. */
function rateFromKBps(kbps: number): number {
  return kbps > 0 ? kbps * 1024 : -1
}

export function applyBandwidthLimits(prefs: Preferences): void {
  if (!client) return
  client.throttleDownload?.(rateFromKBps(prefs.downloadLimitKBps))
  client.throttleUpload?.(rateFromKBps(prefs.uploadLimitKBps))
}

export async function getReadyClient(): Promise<WebTorrentClient> {
  const WT = await getWebTorrentConstructor()
  if (!client) {
    const prefs = getPreferences()
    client = new WT({
      downloadLimit: rateFromKBps(prefs.downloadLimitKBps),
      uploadLimit: rateFromKBps(prefs.uploadLimitKBps)
    })
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
  srv.server?.on('request', (_req, res) => {
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  })
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

const VIDEO_RE = /\.(mp4|mkv|webm|m4v|mov|avi|ts|m2ts|wmv)$/i
const SAMPLE_RE = /(^|[\\/._\-\s])sample([\\/._\-\s]|$)/i
/** RAR volumes (`.rar`, `.r00`, `.part01.rar`) and zip archives. */
const ARCHIVE_RE = /\.(rar|r\d{2}|zip)$/i

export function isArchiveFileName(name: string): boolean {
  return ARCHIVE_RE.test(name)
}

/** Archive volumes in play order, first volume first; empty when the torrent has none. */
export function archiveVolumes(torrent: WtTorrent): WtFile[] {
  const volumes = (torrent.files ?? []).filter(
    (f) => ARCHIVE_RE.test(f.name) && !SAMPLE_RE.test(f.path)
  )
  const rank = (name: string): number => {
    const n = name.toLowerCase()
    const part = /\.part0*(\d+)\.rar$/.exec(n)
    if (part) return Number(part[1])
    if (n.endsWith('.rar') || n.endsWith('.zip')) return 0
    const r = /\.r(\d{2})$/.exec(n)
    return r ? Number(r[1]) + 1 : 1000
  }
  return volumes.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

/**
 * The largest real video, skipping samples. Scene releases that pack the movie in RAR volumes
 * (often with a small sample video beside them) yield the first archive volume instead.
 */
/** In a season pack, the video whose name carries this season and episode number. */
export function pickEpisodeFile(
  torrent: WtTorrent,
  season: number,
  episode: number
): WtFile | null {
  const matches = (torrent.files ?? []).filter((f) => {
    if (!VIDEO_RE.test(f.name) || SAMPLE_RE.test(f.path)) return false
    const r = parseReleaseTitle(f.path.replace(/[\\/]/g, ' '))
    return r.season === season && r.episode === episode
  })
  return [...matches].sort((a, b) => b.length - a.length)[0] ?? null
}

export function pickPlayableFile(torrent: WtTorrent): WtFile | null {
  if (!torrent.files?.length) return null
  const videos = torrent.files.filter(
    (f) => (VIDEO_RE.test(f.name) || VIDEO_RE.test(f.path)) && !SAMPLE_RE.test(f.path)
  )
  if (videos.length > 0) return [...videos].sort((a, b) => b.length - a.length)[0] ?? null
  return archiveVolumes(torrent)[0] ?? null
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
