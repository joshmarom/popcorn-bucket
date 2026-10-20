import { app, shell, BrowserWindow, Menu, session, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc-handlers'
import { migrateStoredSecrets } from './settings-store'
import { migrateStoredSession } from './session-store'
import { closeLibrary } from './library/db'
import { importLegacyLibrary } from './library/migrate'
import { startAutoUpdates } from './auto-update'
import { resetDownloadsBroadcast, startDownloadsBroadcast } from './downloads-broadcast'
import { isSafeTorrentDetailsUrl } from '@shared/torrent'

// Enable SharedArrayBuffer for ffmpeg.wasm (mkv-web) without requiring COEP require-corp on cross-origin posters.
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
// Dev builds are ad-hoc signed, so macOS asks for the login keychain on every launch.
// A mock keychain skips that prompt. Packaged builds still use the real keychain.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('use-mock-keychain')
}
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
  // Ensure cross-origin isolation (SharedArrayBuffer for ffmpeg.wasm / mkv-web) even if the
  // Vite dev server wasn't restarted after config changes, while allowing cross-origin images.
  ses.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    if (
      details.url.startsWith('http://localhost:') ||
      details.url.startsWith('http://127.0.0.1:')
    ) {
      responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin']
      responseHeaders['Cross-Origin-Embedder-Policy'] = ['credentialless']
      responseHeaders['Cross-Origin-Resource-Policy'] = ['cross-origin']
    }
    callback({ responseHeaders })
  })
}

/** Packaged builds keep zoom and fullscreen, and drop the developer tools entry. */
function productionApplicationMenu(): Menu {
  const template: MenuItemConstructorOptions[] = []
  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }
  template.push(
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin'
          ? [{ role: 'pasteAndMatchStyle' as const }, { role: 'delete' as const }]
          : [{ role: 'delete' as const }]),
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu:
        process.platform === 'darwin'
          ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
          : [{ role: 'minimize' }, { role: 'close' }]
    }
  )
  return Menu.buildFromTemplate(template)
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
      devTools: is.dev
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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
  // Packaged macOS builds take the icon from icon.icns; dev runs the stock Electron bundle.
  if (is.dev && process.platform === 'darwin') app.dock?.setIcon(icon)

  // F12 opens DevTools in development and CommandOrControl+R is ignored in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  if (!is.dev) Menu.setApplicationMenu(productionApplicationMenu())

  migrateStoredSecrets()
  migrateStoredSession()
  importLegacyLibrary()
  lockDownMainSession()
  installLocalMediaProtocol()
  registerIpcHandlers()
  restoreMovieDownloadsOnStartup()
  startDownloadsBroadcast()
  void startAutoUpdates()

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
  closeLibrary()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
