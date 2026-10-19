import { BrowserWindow } from 'electron'
import { VIDKING_PARTITION, restrictVidkingPopups } from './vidking-session'

let vidkingWindow: BrowserWindow | null = null

const VIDCORE_EMBED_HOSTS = new Set(['vidcore.org', 'www.vidcore.org'])

/**
 * vidcore.org frames its player from a rotating *.edgeone.dev host.
 * Stream/CDN hosts rotate and are not listed here on purpose:
 * subresource loads are not gated by this check, only popups and storage access.
 */
function isVidkingRelatedOrigin(hostname: string): boolean {
  return (
    hostname === 'vidcore.org' ||
    hostname.endsWith('.vidcore.org') ||
    hostname.endsWith('.edgeone.dev')
  )
}

export function isVidkingRelatedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && isVidkingRelatedOrigin(u.hostname)
  } catch {
    return false
  }
}

export function isVidkingEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return VIDCORE_EMBED_HOSTS.has(u.hostname) && u.pathname.startsWith('/embed/')
  } catch {
    return false
  }
}

/**
 * Open (or reuse) a dedicated BrowserWindow for the VidCore embed. The embed URL
 * is loaded as a true top-level document (no parent iframe), which bypasses any
 * embed-specific gating on VidCore's side — matching the behavior of just
 * pasting the URL into a browser tab.
 */
export function openOrFocusVidkingEmbed(url: string, parent: BrowserWindow | null): void {
  if (!isVidkingEmbedUrl(url)) {
    throw new Error('Invalid VidCore embed URL.')
  }

  if (vidkingWindow && !vidkingWindow.isDestroyed()) {
    try {
      const current = new URL(vidkingWindow.webContents.getURL())
      const next = new URL(url)
      if (current.origin === next.origin && current.pathname === next.pathname) {
        vidkingWindow.focus()
        return
      }
    } catch {
      // fall through
    }
    void vidkingWindow.loadURL(url)
    vidkingWindow.focus()
    return
  }

  vidkingWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 880,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    webPreferences: {
      partition: VIDKING_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  restrictVidkingPopups(vidkingWindow.webContents)

  vidkingWindow.on('closed', () => {
    vidkingWindow = null
  })

  void vidkingWindow.loadURL(url)
  vidkingWindow.once('ready-to-show', () => {
    vidkingWindow?.show()
  })
}
