import './env'
import { getLibrary } from '../../src/main/library/db'
import { getTrendingPage } from '../../src/main/torrent/trending-watchable'
import { getTrendingTvPage } from '../../src/main/torrent/trending-tv'
import { configureTorrentClaw } from '../../src/main/torrentclaw/client'
import { runHarvestJobs } from './harvest'
import { migrate } from './migrate'
import { serverSettings } from './secrets'

configureTorrentClaw({ getApiKey: () => serverSettings().torrentClawApiKey })

const started = new Date()
try {
  await migrate()
  const settings = serverSettings()
  await getTrendingPage(settings, 1, { forceRefresh: true })
  await getTrendingTvPage(settings, 1, { forceRefresh: true })
  await runHarvestJobs()
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

