import type { TvEpisode, TvSeasonDetails } from '@shared/tv'
import type { LibraryDb } from './db'
import { enqueueMediaFromUrls } from './media-assets'

export function saveTvSeason(db: LibraryDb, season: TvSeasonDetails): void {
  const upsertSeason = db.prepare(
    `INSERT INTO seasons (show_id, season_number, name, episode_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (show_id, season_number) DO UPDATE SET
       episode_count = excluded.episode_count`
  )
  upsertSeason.run(
    season.showId,
    season.seasonNumber,
    `Season ${season.seasonNumber}`,
    season.episodes.length
  )
  const upsertEpisode = db.prepare(
    `INSERT INTO episodes (
       id, show_id, season_number, episode_number, name, overview, air_date, runtime, still_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (show_id, season_number, episode_number) DO UPDATE SET
       name = excluded.name,
       overview = excluded.overview,
       air_date = COALESCE(excluded.air_date, episodes.air_date),
       runtime = COALESCE(excluded.runtime, episodes.runtime),
       still_url = COALESCE(excluded.still_url, episodes.still_url)`
  )
  for (const episode of season.episodes) {
    upsertEpisode.run(
      episode.id,
      season.showId,
      episode.seasonNumber,
      episode.episodeNumber,
      episode.name,
      episode.overview,
      episode.airDate,
      episode.runtime,
      episode.stillUrl
    )
    enqueueMediaFromUrls(db, { stillUrls: episode.stillUrl ? [episode.stillUrl] : [] })
  }
}

export function readStoredTvSeason(
  db: LibraryDb,
  showId: number,
  seasonNumber: number
): TvSeasonDetails | null {
  const rows = db
    .prepare(
      `SELECT id, season_number, episode_number, name, overview, air_date, runtime, still_url
       FROM episodes
       WHERE show_id = ? AND season_number = ?
       ORDER BY episode_number`
    )
    .all(showId, seasonNumber) as {
    id: number
    season_number: number
    episode_number: number
    name: string
    overview: string
    air_date: string | null
    runtime: number | null
    still_url: string | null
  }[]
  if (rows.length === 0) return null
  const episodes: TvEpisode[] = rows.map((row) => ({
    id: row.id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    name: row.name,
    overview: row.overview,
    airDate: row.air_date,
    runtime: row.runtime,
    stillUrl: row.still_url
  }))
  return { showId, seasonNumber, episodes }
}
