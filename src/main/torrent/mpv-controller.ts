/**
 * External mpv process, driven over mpv's JSON IPC socket so the app knows the playback
 * position, duration, and end-of-file, and can resume from a saved position.
 *
 * Events on `mpvEvents`:
 * - `progress` (MpvPlaybackState) while playing, at most every few seconds
 * - `end` (MpvPlaybackState & { eof: boolean }) when the mpv process exits
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, rmSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type MpvPlaybackState = {
  /** Caller-supplied tag, e.g. the movie and download this session plays. */
  tag: MpvSessionTag | null
  position: number | null
  duration: number | null
}

export type MpvSessionTag = { movieId: number; downloadId: string }

export const mpvEvents = new EventEmitter()

type Session = {
  child: ChildProcess
  socket: Socket | null
  socketPath: string
  state: MpvPlaybackState
  eof: boolean
  lastProgressEmit: number
}

let current: Session | null = null
let sessionCounter = 0

const PROGRESS_EMIT_MS = 5_000

function ipcPath(): string {
  sessionCounter += 1
  const name = `pb-mpv-${process.pid}-${sessionCounter}`
  return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`)
}

function handleIpcLine(session: Session, line: string): void {
  let msg: { event?: string; name?: string; data?: unknown; reason?: string }
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.event === 'property-change') {
    const n = typeof msg.data === 'number' && Number.isFinite(msg.data) ? msg.data : null
    if (msg.name === 'time-pos' && n != null) session.state.position = n
    if (msg.name === 'duration' && n != null) session.state.duration = n
    if (msg.name === 'eof-reached' && msg.data === true) session.eof = true
    const now = Date.now()
    if (msg.name === 'time-pos' && now - session.lastProgressEmit >= PROGRESS_EMIT_MS) {
      session.lastProgressEmit = now
      mpvEvents.emit('progress', { ...session.state })
    }
  } else if (msg.event === 'end-file' && msg.reason === 'eof') {
    session.eof = true
  }
}

function attachIpc(session: Session): void {
  const deadline = Date.now() + 10_000
  const tryConnect = (): void => {
    if (current !== session) return
    const sock = connect(session.socketPath)
    sock.setEncoding('utf8')
    let buffer = ''
    sock.on('connect', () => {
      session.socket = sock
      const observe = ['time-pos', 'duration', 'eof-reached']
      observe.forEach((name, i) => {
        sock.write(`${JSON.stringify({ command: ['observe_property', i + 1, name] })}\n`)
      })
    })
    sock.on('data', (chunk: string) => {
      buffer += chunk
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        handleIpcLine(session, buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    })
    sock.on('error', () => {
      if (session.socket == null && Date.now() < deadline) setTimeout(tryConnect, 150)
    })
  }
  setTimeout(tryConnect, 150)
}

export async function startExternalMpvSession(params: {
  /** Stream URL or local file path. */
  url: string
  title: string
  subFiles?: string[]
  /** Resume position in seconds. */
  startSeconds?: number
  tag?: MpvSessionTag
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bin = findMpvBinary()
  if (!bin) return { ok: false, error: mpvNotFoundMessage() }

  // Replace any previous session cleanly before spawning a new one.
  await shutdownCurrentMpvSession()

  const socketPath = ipcPath()
  const args = [
    params.url,
    `--force-media-title=${params.title}`,
    '--force-window=yes',
    '--idle=no',
    '--keep-open=no',
    '--no-terminal',
    '--msg-level=all=warn',
    `--input-ipc-server=${socketPath}`,
    ...(params.startSeconds && params.startSeconds > 0
      ? [`--start=${Math.floor(params.startSeconds)}`]
      : []),
    ...(params.subFiles ?? []).map((p) => `--sub-file=${p}`)
  ]

  let child: ChildProcess
  try {
    child = spawn(bin, args, {
      stdio: 'ignore',
      detached: false,
      windowsHide: false
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Could not launch mpv: ${msg}` }
  }

  const session: Session = {
    child,
    socket: null,
    socketPath,
    state: { tag: params.tag ?? null, position: null, duration: null },
    eof: false,
    lastProgressEmit: 0
  }
  current = session
  attachIpc(session)

  const onDie = (): void => {
    session.socket?.destroy()
    if (process.platform !== 'win32') rmSync(socketPath, { force: true })
    if (current === session) {
      current = null
      mpvEvents.emit('end', { ...session.state, eof: session.eof })
    }
  }
  child.once('exit', onDie)
  child.once('error', onDie)

  return { ok: true }
}

export async function shutdownCurrentMpvSession(): Promise<void> {
  const session = current
  if (!session) return
  current = null
  // A replaced session still reports where it stopped, so progress is not lost.
  mpvEvents.emit('end', { ...session.state, eof: session.eof })
  session.socket?.destroy()
  try {
    session.child.kill()
  } catch {
    /* already gone */
  }
}

/**
 * Locate an mpv binary for the current platform. Electron GUI apps on macOS
 * often launch with a minimal PATH, so we also probe well-known install
 * locations when PATH lookup fails.
 */
export function findMpvBinary(): string | null {
  try {
    const locator = process.platform === 'win32' ? 'where' : 'which'
    const out = execFileSync(locator, ['mpv'], { encoding: 'utf8', timeout: 3000 })
    const line = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    if (line && existsSync(line)) return line
  } catch {
    /* fall through to candidate probing */
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\mpv\\mpv.exe',
          'C:\\Program Files (x86)\\mpv\\mpv.exe',
          `${process.env.LOCALAPPDATA ?? ''}\\Programs\\mpv\\mpv.exe`
        ]
      : [
          '/opt/homebrew/bin/mpv',
          '/usr/local/bin/mpv',
          '/Applications/mpv.app/Contents/MacOS/mpv',
          '/usr/bin/mpv'
        ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

export function mpvNotFoundMessage(): string {
  if (process.platform === 'darwin') {
    return 'mpv is required to play this format. Install it with `brew install mpv` (or from mpv.io), then try again.'
  }
  if (process.platform === 'win32') {
    return 'mpv is required to play this format. Install mpv from mpv.io and make sure `mpv.exe` is on your PATH, then try again.'
  }
  return 'mpv is required to play this format. Install it via your package manager (e.g. `apt install mpv`), then try again.'
}
