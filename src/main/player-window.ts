import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { InlinePlayerSession } from '@shared/torrent-stream'

export const playerWindowEvents = new EventEmitter()

let playerWindow: BrowserWindow | null = null
let currentSession: InlinePlayerSession | null = null

export function getPlayerSession(): InlinePlayerSession | null {
  return currentSession
}

export function openPlayerWindow(session: InlinePlayerSession): void {
  currentSession = session

  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.setTitle(session.fileLabel)
    playerWindow.webContents.send('player:session', session)
    if (playerWindow.isMinimized()) playerWindow.restore()
    playerWindow.show()
    playerWindow.focus()
    return
  }

  playerWindow = new BrowserWindow({
    width: 1120,
    height: 680,
    minWidth: 640,
    minHeight: 380,
    title: session.fileLabel,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  playerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  playerWindow.once('ready-to-show', () => {
    playerWindow?.show()
    playerWindow?.focus()
  })

  playerWindow.on('closed', () => {
    playerWindow = null
    currentSession = null
    playerWindowEvents.emit('end')
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')
    void playerWindow.loadURL(`${base}/#/player`)
  } else {
    void playerWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/player' })
  }
}

export function closePlayerWindow(): void {
  currentSession = null
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.close()
  }
  playerWindow = null
}
