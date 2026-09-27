import { BrowserWindow } from 'electron'
import { getAllMovieDownloads } from './torrent/movie-downloads'

const INTERVAL_MS = 1000

let timer: ReturnType<typeof setInterval> | null = null
let lastPayload = ''

/** Sends the download list to every window, but only when something changed. */
export function broadcastDownloadsNow(): void {
  const rows = getAllMovieDownloads()
  const payload = JSON.stringify(rows)
  if (payload === lastPayload) return
  lastPayload = payload
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    try {
      w.webContents.send('downloads:update', rows)
    } catch {
      /* window may have gone away mid-send */
    }
  }
}

/** Replaces renderer polling: the main process pushes `downloads:update` while anything changes. */
export function startDownloadsBroadcast(): void {
  if (timer) return
  timer = setInterval(broadcastDownloadsNow, INTERVAL_MS)
}

/** A newly loaded page has no state yet; the next tick must send even if nothing changed. */
export function resetDownloadsBroadcast(): void {
  lastPayload = ''
}
