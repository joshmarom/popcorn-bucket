import { DETAILS_STALE_MS } from '../../src/main/catalog-fresh'
import { getLibrary } from '../../src/main/library/db'
import { moviesNeedingDetails } from '../../src/main/library/movies'
import { showsNeedingDetails } from '../../src/main/library/shows'
import { getMovieDetails } from '../../src/main/tmdb'
import { getTvShowDetails } from '../../src/main/tmdb-tv'
import { ingestTrendingLists } from '../../src/main/torrentclaw/discovery'
import { getPool } from './db'
import { drainMediaQueue } from './media-store'
import { serverSettings } from './secrets'

const HYDRATE_LIMIT = 20

export async function runHarvestJobs(): Promise<void> {
  const settings = serverSettings()
  const db = getLibrary()
  const staleBefore = Date.now() - DETAILS_STALE_MS

  await ingestTrendingLists(db).catch((error) => {
    console.warn('TorrentClaw list ingest failed', error)
  })

  const movieIds = new Set(moviesNeedingDetails(db, HYDRATE_LIMIT, staleBefore))
  const showIds = new Set(showsNeedingDetails(db, HYDRATE_LIMIT, staleBefore))
  for (const id of await prefetchUserTitleIds()) {
    if (id.mediaType === 'movie') movieIds.add(id.tmdbId)
    else showIds.add(id.tmdbId)
  }

  for (const tmdbId of [...movieIds].slice(0, HYDRATE_LIMIT)) {
    await getMovieDetails(settings, tmdbId).catch(() => undefined)
  }
  for (const tmdbId of [...showIds].slice(0, HYDRATE_LIMIT)) {
    await getTvShowDetails(settings, tmdbId).catch(() => undefined)
  }

  await drainMediaQueue(40)
}

async function prefetchUserTitleIds(): Promise<{ mediaType: 'movie' | 'show'; tmdbId: number }[]> {
  try {
    const result = await getPool().query<{ media_type: 'movie' | 'show'; tmdb_id: number }>(
      `SELECT media_type, tmdb_id FROM watchlist_items
       UNION
       SELECT media_type, tmdb_id FROM watch_progress WHERE finished = 0`
    )
    return result.rows.map((row) => ({ mediaType: row.media_type, tmdbId: row.tmdb_id }))
  } catch {
    return []
  }
}
