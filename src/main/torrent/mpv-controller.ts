/**
 * Thin wrapper around an external mpv process. We just spawn mpv with its
 * native on-screen controls enabled and keep a handle so we can (a) replace
 * the running session when another playback starts, (b) kill mpv cleanly on
 * app shutdown, and (c) notify the renderer when playback ends (so it can
 * clear any "now playing" state).
 *
 * No JSON IPC, no in-app controls — playback is driven entirely by mpv's own
 * window. If we ever re-introduce an in-app control surface it can layer on
 * top of this by re-adding `--input-ipc-server` + a socket client.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'

/** Emits 'end' whenever the current mpv process exits. */
export const mpvEvents = new EventEmitter()

let currentChild: ChildProcess | null = null

export async function startExternalMpvSession(params: {
  /** Stream URL or local file path. */
  url: string
  title: string
  subFiles?: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bin = findMpvBinary()
  if (!bin) return { ok: false, error: mpvNotFoundMessage() }

  // Replace any previous session cleanly before spawning a new one.
  await shutdownCurrentMpvSession()

  const args = [
    params.url,
    `--force-media-title=${params.title}`,
    '--force-window=yes',
    '--idle=no',
    '--keep-open=no',
    '--no-terminal',
    '--msg-level=all=warn',
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

  currentChild = child
  const onDie = (): void => {
    if (currentChild === child) {
      currentChild = null
      mpvEvents.emit('end')
    }
  }
  child.once('exit', onDie)
  child.once('error', onDie)

  return { ok: true }
}

export async function shutdownCurrentMpvSession(): Promise<void> {
  const child = currentChild
  if (!child) return
  currentChild = null
  try {
    child.kill()
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
