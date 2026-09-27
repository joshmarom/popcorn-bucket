import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc-handlers'
import { installVidkingDiagnosticsHooks } from './vidking-diagnostics'
import { isVidkingRelatedUrl } from './vidking-embed-window'

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

function installVidkingNetworkCompatibilityShim(): void {
  const ses = session.defaultSession
  const chromeLikeUa = ses.getUserAgent().replace(/\sElectron\/[^\s]+/, '')
  if (chromeLikeUa === ses.getUserAgent()) return

  // Make runtime UA checks inside embedded pages (navigator.userAgent) align
  // with request headers by removing the Electron token globally for this app
  // session. This helps providers that gate source availability for Electron.
  ses.setUserAgent(chromeLikeUa)

  // Some upstream providers serve empty source lists to Electron-branded UA
  // strings. Rewriting only VidKing/Videasy traffic keeps app-wide behavior
  // untouched while restoring server discovery in both iframe + popup flows.
  ses.webRequest.onBeforeSendHeaders(
    {
      urls: [
        '*://*.vidking.net/*',
        '*://*.videasy.net/*',
        '*://*.dolesdao.com/*',
        '*://*.workers.dev/*'
      ]
    },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'User-Agent': chromeLikeUa
        }
      })
    }
  )

  // Allow VidKing/Videasy to request storage access in iframe flows.
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      return isVidkingRelatedUrl(requestingOrigin)
    }
    return true
  })

  ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === 'storage-access' || permission === 'top-level-storage-access') {
      callback(isVidkingRelatedUrl(details.requestingUrl))
      return
    }
    callback(true)
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isVidkingRelatedUrl(details.url)) {
      return { action: 'allow' }
    }
    shell.openExternal(details.url)
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

  installVidkingNetworkCompatibilityShim()
  installVidkingDiagnosticsHooks(session.defaultSession)
  registerIpcHandlers()
  restoreMovieDownloadsOnStartup()

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
