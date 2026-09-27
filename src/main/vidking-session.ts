import { session, type Session, type WebContents } from 'electron'
import { installVidkingDiagnosticsHooks } from './vidking-diagnostics'
import { isVidkingEmbedUrl, isVidkingRelatedUrl } from './vidking-embed-window'

export const VIDKING_PARTITION = 'persist:vidking'

/** Permissions the VidKing session never gets, whatever the page asks for. */
const VIDKING_DENIED_PERMISSIONS = new Set<string>([
  'media',
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'openExternal',
  'clipboard-read',
  'hid',
  'serial',
  'usb',
  'idle-detection',
  'window-management',
  'display-capture',
  'speaker-selection',
  'keyboardLock',
  'fileSystem'
])

let installed = false

export function getVidkingSession(): Session {
  return session.fromPartition(VIDKING_PARTITION)
}

function isStorageAccessPermission(permission: string): boolean {
  return permission === 'storage-access' || permission === 'top-level-storage-access'
}

/**
 * VidKing gets its own persistent session so its cookies, storage, user-agent
 * workarounds, and permissions never touch the main app session.
 */
export function installVidkingSession(): void {
  if (installed) return
  installed = true
  const ses = getVidkingSession()

  // Some upstream providers serve empty source lists to Electron-branded UA strings,
  // so the VidKing session presents a plain Chrome user agent.
  const chromeLikeUa = ses.getUserAgent().replace(/\sElectron\/[^\s]+/, '')
  ses.setUserAgent(chromeLikeUa)

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (isStorageAccessPermission(permission)) return isVidkingRelatedUrl(requestingOrigin)
    return !VIDKING_DENIED_PERMISSIONS.has(permission)
  })

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (isStorageAccessPermission(permission)) {
      callback(isVidkingRelatedUrl(details.requestingUrl))
      return
    }
    callback(!VIDKING_DENIED_PERMISSIONS.has(permission))
  })

  installVidkingDiagnosticsHooks(ses)
}

/** Popups from VidKing pages stay inside the VidKing session; anything else is dropped. */
export function restrictVidkingPopups(contents: WebContents): void {
  contents.setWindowOpenHandler((details) => {
    if (!isVidkingRelatedUrl(details.url)) return { action: 'deny' }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        webPreferences: {
          partition: VIDKING_PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      }
    }
  })
}

/**
 * The main window may host exactly one kind of `<webview>`: the VidKing embed, in the
 * VidKing session, with no preload and no Node. The renderer cannot loosen any of this.
 */
export function guardVidkingWebviews(host: WebContents): void {
  host.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isVidkingEmbedUrl(params.src)) {
      event.preventDefault()
      return
    }
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.partition = VIDKING_PARTITION
    params.partition = VIDKING_PARTITION
  })
  host.on('did-attach-webview', (_event, contents) => {
    restrictVidkingPopups(contents)
  })
}

export async function clearVidkingSessionData(): Promise<void> {
  const ses = getVidkingSession()
  await ses.clearStorageData()
  await ses.clearCache()
}
