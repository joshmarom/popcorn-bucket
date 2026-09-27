import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc-handlers'
import { migratePlaintextSecrets } from './settings-store'
import { resetDownloadsBroadcast, startDownloadsBroadcast } from './downloads-broadcast'
import { guardVidkingWebviews, installVidkingSession } from './vidking-session'
import { isSafeTorrentDetailsUrl } from '@shared/torrent'

/**
 * VidKing and similar embeds often discover "servers" via LAN / permission APIs.
 * In a cross-origin iframe under Electron, Chromium can default the
 * `local-network-access` permissions policy to denied while the top-level frame
 * is treated differently — so the player shows no servers. This switch aligns
 * the default with typical Electron "local requests allowed" behavior.
 * @see https://github.com/electron/electron/issues/50391
 */
app.commandLine.appendSwitch('local-network-access-permissions-policy-default-enabled')
import {
  flushMovieDownloadsPersistence,
  restoreMovieDownloadsOnStartup,
  shutdownMovieDownloads
} from './torrent/movie-downloads'
import { installLocalMediaProtocol, registerLocalMediaScheme } from './local-media-protocol'

registerLocalMediaScheme()

/** The main app session grants only what the app itself uses. */
const MAIN_ALLOWED_PERMISSIONS = new Set<string>(['fullscreen', 'clipboard-sanitized-write'])

function lockDownMainSession(): void {
  const ses = session.defaultSession
  ses.setPermissionCheckHandler((_wc, permission) => MAIN_ALLOWED_PERMISSIONS.has(permission))
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(MAIN_ALLOWED_PERMISSIONS.has(permission))
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  guardVidkingWebviews(mainWindow.webContents)
  mainWindow.webContents.on('did-finish-load', resetDownloadsBroadcast)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeTorrentDetailsUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.popcorn-bucket.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  migratePlaintextSecrets()
  lockDownMainSession()
  installVidkingSession()
  installLocalMediaProtocol()
  registerIpcHandlers()
  restoreMovieDownloadsOnStartup()
  startDownloadsBroadcast()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  flushMovieDownloadsPersistence()
  shutdownMovieDownloads()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
