import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Checks for updates in packaged builds that were built with an update feed (PB_UPDATE_URL).
 * Without `app-update.yml` in the resources there is no feed, so this does nothing.
 */
export async function startAutoUpdates(): Promise<void> {
  if (!app.isPackaged) return
  if (!existsSync(join(process.resourcesPath, 'app-update.yml'))) return
  const { autoUpdater } = await import('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const check = (): void => {
    void autoUpdater.checkForUpdatesAndNotify().catch(() => {
      /* offline or feed unavailable; try again next interval */
    })
  }
  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
