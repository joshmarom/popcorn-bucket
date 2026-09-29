import './env'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getLibrary } from '../../src/main/library/db'
import { getTrendingPage } from '../../src/main/torrent/trending-watchable'
import { getTrendingTvPage } from '../../src/main/torrent/trending-tv'
import { configureTorrentClaw } from '../../src/main/torrentclaw/client'
import { serverSettings } from './secrets'

loadEnvFile(join(homedir(), '.config', 'popcorn', 'env'))
configureTorrentClaw({ getApiKey: () => serverSettings().torrentClawApiKey })

const started = new Date()
try {
  const settings = serverSettings()
  await getTrendingPage(settings, 1, { forceRefresh: true })
  await getTrendingTvPage(settings, 1, { forceRefresh: true })
  recordJob(true, null)
  console.log('refresh ok')
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  recordJob(false, detail)
  console.error(detail)
  process.exit(1)
}

function recordJob(ok: boolean, detail: string | null): void {
  getLibrary()
    .prepare(
      `INSERT INTO job_runs (name, started_at, finished_at, ok, detail)
       VALUES (?, ?, now(), ?, ?)`
    )
    .run('trending', started.toISOString(), ok, detail)
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}
