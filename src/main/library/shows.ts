import type { CatalogCastMember, CatalogTrailer } from '@shared/catalog'
import { movieScore } from '@shared/movie-score'
import type { TvShowDetails, TvShowListItem } from '@shared/tv'
import type { LibraryDb } from './db'
import { enqueueMediaFromUrls } from './media-assets'
import { RANK_POOL_WINDOW_MS, pickSwarmEvidence, type TrendingSwarmRow } from './ranked-lists'

/** One row from a TMDB TV list endpoint (popular, search, find). */
export type LibraryShowListRow = {
  tmdbId: number
  name: string
  firstAirDate: string | null
  overview: string
  posterUrl: string | null
  backdropUrl?: string | null
  voteAverage: number | null
  voteCount: number | null
  popularity: number | null
  imdbId?: string | null
  /** Genre names; empty keeps what the library already has. */
  genres?: string[]
  originCountry?: string[]
  titleOriginal?: string | null
}

export type LibraryShowDetails = {
  tmdbId: number
  name: string
  firstAirDate: string | null
  overview: string
  posterUrl: string | null
  backdropUrl?: string | null
  imdbId: string | null
  voteAverage: number | null
  voteCount: number | null
  popularity: number | null
  titleOriginal?: string | null
  originCountry?: string[]
  seasons?: TvShowDetails['seasons']
  cast?: CatalogCastMember[]
  trailers?: CatalogTrailer[]
  /** Card facts from the full TMDB record; written together with `facts_at`. */
  facts?: {
    genres: string[]
    seasonCount: number | null
    tmdbStatus: string | null
    lastAirDate: string | null
    lastEpisodeAirDate: string | null
  }
}

export type StoredShowListFacts = {
  id: number
  genres: string[]
  seasonCount: number | null
  firstAirYear: number | null
  tmdbStatus: string | null
  lastAirDate: string | null
  lastEpisodeAirDate: string | null
  voteAverage: number | null
  /** When the facts were last written from show details; null if never. */
  factsAt: number | null
}

type ShowPoolRow = {
  tmdb_id: number
  name: string
  year: number | null
  first_air_date: string | null
  overview: string
  poster_url: string | null
  rating: number | null
  vote_count: number | null
  tmdb_popularity: number | null
  genres_json: string | null
  swarm_seeders: number | null
  swarm_seen_at: number | null
  swarm_upload_unix: number | null
  copy_seeders: number | null
  copy_seen_at: number | null
}

function airYear(date: string | null): number | null {
  if (!date || !/^\d{4}/.test(date)) return null
  const year = Number(date.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

function storedImdbId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return /^tt\d+$/i.test(trimmed) ? trimmed.toLowerCase() : null
}

function genresJson(genres: string[] | undefined): string | null {
  const clean = [...new Set((genres ?? []).map((g) => g.trim()).filter(Boolean))]
  return clean.length > 0 ? JSON.stringify(clean) : null
}

function parseGenres(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

/** Records TMDB list rows without overwriting what the show page saved. */
export function upsertShowListRows(
  db: LibraryDb,
  rows: LibraryShowListRow[],
  seenAt = Date.now()
): void {
  const upsert = db.prepare(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, year, imdb_id, overview, poster_url, backdrop_url,
       rating, vote_count, tmdb_popularity, list_seen_at, updated_at, genres_json,
       origin_country_json, title_original
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       name = excluded.name,
       first_air_date = COALESCE(excluded.first_air_date, shows.first_air_date),
       year = COALESCE(excluded.year, shows.year),
       imdb_id = COALESCE(shows.imdb_id, excluded.imdb_id),
       overview = CASE WHEN shows.overview = '' THEN excluded.overview ELSE shows.overview END,
       poster_url = COALESCE(shows.poster_url, excluded.poster_url),
       backdrop_url = COALESCE(shows.backdrop_url, excluded.backdrop_url),
       rating = COALESCE(excluded.rating, shows.rating),
       vote_count = COALESCE(excluded.vote_count, shows.vote_count),
       tmdb_popularity = COALESCE(excluded.tmdb_popularity, shows.tmdb_popularity),
       list_seen_at = excluded.list_seen_at,
       genres_json = COALESCE(shows.genres_json, excluded.genres_json),
       origin_country_json = COALESCE(shows.origin_country_json, excluded.origin_country_json),
       title_original = COALESCE(shows.title_original, excluded.title_original)`
  )
  const run = db.transaction(() => {
    for (const row of rows) {
      upsert.run(
        row.tmdbId,
        row.name,
        row.firstAirDate,
        airYear(row.firstAirDate),
        storedImdbId(row.imdbId),
        row.overview,
        row.posterUrl,
        row.backdropUrl ?? null,
        row.voteAverage,
        row.voteCount,
        row.popularity,
        seenAt,
        seenAt,
        genresJson(row.genres),
        row.originCountry && row.originCountry.length > 0
          ? JSON.stringify(row.originCountry)
          : null,
        row.titleOriginal ?? null
      )
      enqueueMediaFromUrls(db, {
        tmdbId: row.tmdbId,
        posterUrl: row.posterUrl,
        backdropUrl: row.backdropUrl
      })
    }
  })
  run()
}

export function upsertShowDetails(db: LibraryDb, show: LibraryShowDetails): void {
  db.prepare(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, year, imdb_id, overview, poster_url, backdrop_url,
       rating, vote_count, tmdb_popularity, updated_at, details_at, title_original,
       origin_country_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       name = excluded.name,
       first_air_date = COALESCE(excluded.first_air_date, shows.first_air_date),
       year = COALESCE(excluded.year, shows.year),
       imdb_id = COALESCE(excluded.imdb_id, shows.imdb_id),
       overview = excluded.overview,
       poster_url = COALESCE(excluded.poster_url, shows.poster_url),
       backdrop_url = COALESCE(excluded.backdrop_url, shows.backdrop_url),
       rating = COALESCE(excluded.rating, shows.rating),
       vote_count = COALESCE(excluded.vote_count, shows.vote_count),
       tmdb_popularity = COALESCE(excluded.tmdb_popularity, shows.tmdb_popularity),
       updated_at = excluded.updated_at,
       details_at = excluded.details_at,
       title_original = COALESCE(excluded.title_original, shows.title_original),
       origin_country_json = COALESCE(excluded.origin_country_json, shows.origin_country_json)`
  ).run(
    show.tmdbId,
    show.name,
    show.firstAirDate,
    airYear(show.firstAirDate),
    storedImdbId(show.imdbId),
    show.overview,
    show.posterUrl,
    show.backdropUrl ?? null,
    show.voteAverage,
    show.voteCount,
    show.popularity,
    Date.now(),
    Date.now(),
    show.titleOriginal ?? null,
    show.originCountry && show.originCountry.length > 0
      ? JSON.stringify(show.originCountry)
      : null
  )
  const f = show.facts
  if (f) {
    db.prepare(
      `UPDATE shows SET
         genres_json = COALESCE(?, genres_json),
         season_count = ?,
         tmdb_status = ?,
         last_air_date = ?,
         last_episode_air_date = ?,
         facts_at = ?
       WHERE tmdb_id = ?`
    ).run(
      genresJson(f.genres),
      f.seasonCount,
      f.tmdbStatus,
      f.lastAirDate,
      f.lastEpisodeAirDate,
      Date.now(),
      show.tmdbId
    )
  }
  enqueueMediaFromUrls(db, {
    tmdbId: show.tmdbId,
    posterUrl: show.posterUrl,
    backdropUrl: show.backdropUrl
  })
  if (show.cast !== undefined || show.trailers !== undefined) {
    db.prepare('UPDATE shows SET cast_json = ?, trailers_json = ? WHERE tmdb_id = ?').run(
      JSON.stringify(show.cast ?? []),
      JSON.stringify(show.trailers ?? []),
      show.tmdbId
    )
  }
  if (show.seasons && show.seasons.length > 0) {
    saveShowSeasonSummaries(db, show.tmdbId, show.seasons)
  }
}

export function saveShowSeasonSummaries(
  db: LibraryDb,
  showId: number,
  seasons: NonNullable<LibraryShowDetails['seasons']>
): void {
  const upsert = db.prepare(
    `INSERT INTO seasons (show_id, season_number, name, episode_count, air_date)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (show_id, season_number) DO UPDATE SET
       name = excluded.name,
       episode_count = excluded.episode_count,
       air_date = COALESCE(excluded.air_date, seasons.air_date)`
  )
  for (const season of seasons) {
    upsert.run(
      showId,
      season.seasonNumber,
      season.name,
      season.episodeCount,
      season.airYear ? `${season.airYear}-01-01` : null
    )
  }
}

type ShowFactsRow = {
  tmdb_id: number
  genres_json: string | null
  season_count: number | null
  year: number | null
  tmdb_status: string | null
  last_air_date: string | null
  last_episode_air_date: string | null
  rating: number | null
  facts_at: number | null
}

export function readShowListFacts(db: LibraryDb, ids: number[]): Map<number, StoredShowListFacts> {
  const out = new Map<number, StoredShowListFacts>()
  if (ids.length === 0) return out
  const rows = db
    .prepare(
      `SELECT tmdb_id, genres_json, season_count, year, tmdb_status, last_air_date,
              last_episode_air_date, rating, facts_at
       FROM shows WHERE tmdb_id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids) as ShowFactsRow[]
  for (const r of rows) {
    out.set(r.tmdb_id, {
      id: r.tmdb_id,
      genres: parseGenres(r.genres_json),
      seasonCount: r.season_count,
      firstAirYear: r.year,
      tmdbStatus: r.tmdb_status,
      lastAirDate: r.last_air_date,
      lastEpisodeAirDate: r.last_episode_air_date,
      voteAverage: r.rating,
      factsAt: r.facts_at
    })
  }
  return out
}

/** Show ids in "My shows", most recently added first. */
export function getShowWatchlist(db: LibraryDb): number[] {
  const rows = db
    .prepare('SELECT show_id FROM show_watchlist ORDER BY added_at DESC, show_id DESC')
    .all() as { show_id: number }[]
  return rows.map((r) => r.show_id)
}

export function setShowInWatchlist(
  db: LibraryDb,
  showId: number,
  inList: boolean,
  now = Date.now()
): number[] {
  if (inList) {
    db.prepare(
      `INSERT INTO show_watchlist (show_id, added_at) VALUES (?, ?)
       ON CONFLICT(show_id) DO UPDATE SET added_at = excluded.added_at`
    ).run(showId, now)
  } else {
    db.prepare('DELETE FROM show_watchlist WHERE show_id = ?').run(showId)
  }
  return getShowWatchlist(db)
}

export function recordShowSwarm(
  db: LibraryDb,
  rows: TrendingSwarmRow[],
  seenAt = Date.now()
): void {
  const upsert = db.prepare(
    `INSERT INTO show_swarm (tmdb_id, seeders, peers, latest_upload_unix, seen_at)
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shows WHERE tmdb_id = ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       seeders = excluded.seeders,
       peers = excluded.peers,
       latest_upload_unix = excluded.latest_upload_unix,
       seen_at = excluded.seen_at`
  )
  const run = db.transaction(() => {
    for (const row of rows) {
      upsert.run(row.tmdbId, row.seeders, row.peers, row.latestUploadUnix, seenAt, row.tmdbId)
    }
  })
  run()
}

/**
 * Episode searches are cached under the show's IMDb id (`tt…::Show S01E02`), so the best
 * non-cam copy across those searches counts as torrent evidence for the show.
 */
function loadShowPool(db: LibraryDb, cutoff: number): ShowPoolRow[] {
  return db
    .prepare(
      `WITH copies AS (
         SELECT s.tmdb_id AS show_id, MAX(t.seeders) AS seeders, t.fetched_at AS fetched_at
         FROM shows s
         JOIN torrent_search_hits h
           ON h.cache_key >= s.imdb_id || '::' AND h.cache_key < s.imdb_id || ':;'
         JOIN torrents t ON t.info_hash = h.info_hash
         WHERE s.imdb_id IS NOT NULL
           AND (t.source IS NULL OR t.source NOT IN ('cam', 'telesync', 'screener'))
         GROUP BY s.tmdb_id
       )
       SELECT s.tmdb_id, s.name, s.year, s.first_air_date, s.overview, s.poster_url,
              s.rating, s.vote_count, s.tmdb_popularity, s.genres_json,
              w.seeders AS swarm_seeders, w.seen_at AS swarm_seen_at,
              w.latest_upload_unix AS swarm_upload_unix,
              c.seeders AS copy_seeders, c.fetched_at AS copy_seen_at
       FROM shows s
       LEFT JOIN show_swarm w ON w.tmdb_id = s.tmdb_id
       LEFT JOIN copies c ON c.show_id = s.tmdb_id
       WHERE s.list_seen_at >= @cutoff OR w.seen_at >= @cutoff OR c.fetched_at >= @cutoff`
    )
    .all({ cutoff }) as ShowPoolRow[]
}

/** A long-running show with a new season is recent: use the newest upload when it beats the premiere. */
function recencyDate(row: ShowPoolRow): string | null {
  const premiere = row.first_air_date ?? (row.year ? String(row.year) : null)
  const upload = row.swarm_upload_unix
  if (!upload || upload <= 0) return premiere
  const uploadDate = new Date(upload * 1000).toISOString().slice(0, 10)
  return premiere == null || uploadDate > premiere ? uploadDate : premiere
}

export function rankShows(db: LibraryDb, opts: { limit: number; now?: number }): TvShowListItem[] {
  const now = opts.now ?? Date.now()
  const scored = loadShowPool(db, now - RANK_POOL_WINDOW_MS).map((row) => {
    const evidence = pickSwarmEvidence(
      { seeders: row.swarm_seeders, seenAt: row.swarm_seen_at },
      { seeders: row.copy_seeders, seenAt: row.copy_seen_at },
      now
    )
    const score = movieScore(
      {
        seeders: evidence.seeders,
        seenAt: evidence.seenAt,
        popularity: row.tmdb_popularity,
        voteAverage: row.rating,
        voteCount: row.vote_count,
        releaseDate: recencyDate(row)
      },
      now
    )
    return { row, score }
  })
  scored.sort((a, b) => b.score - a.score || a.row.tmdb_id - b.row.tmdb_id)
  return scored.slice(0, opts.limit).map(({ row }) => ({
    id: row.tmdb_id,
    name: row.name,
    firstAirYear: row.year,
    posterUrl: row.poster_url,
    overview: row.overview,
    voteAverage: row.rating,
    genres: parseGenres(row.genres_json)
  }))
}

export type StoredShowDetails = {
  details: TvShowDetails
  detailsAt: number | null
  /** False when this row was saved before cast and trailers were stored. */
  extrasStored: boolean
}

function parseCast(json: string | null): CatalogCastMember[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const member = row as { name?: unknown; character?: unknown; profileUrl?: unknown }
      if (typeof member.name !== 'string' || !member.name.trim()) return []
      return [
        {
          name: member.name,
          character: typeof member.character === 'string' ? member.character : '',
          profileUrl: typeof member.profileUrl === 'string' ? member.profileUrl : null
        }
      ]
    })
  } catch {
    return []
  }
}

function parseTrailers(json: string | null): CatalogTrailer[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const trailer = row as { name?: unknown; youtubeKey?: unknown }
      if (typeof trailer.youtubeKey !== 'string' || !trailer.youtubeKey.trim()) return []
      return [
        {
          name: typeof trailer.name === 'string' && trailer.name.trim() ? trailer.name : 'Trailer',
          youtubeKey: trailer.youtubeKey.trim()
        }
      ]
    })
  } catch {
    return []
  }
}

export function readStoredShowDetails(db: LibraryDb, tmdbId: number): StoredShowDetails | null {
  const row = db
    .prepare(
      `SELECT tmdb_id, name, overview, first_air_date, year, poster_url, backdrop_url,
              imdb_id, details_at, cast_json, trailers_json
       FROM shows WHERE tmdb_id = ?`
    )
    .get(tmdbId) as
    | {
        tmdb_id: number
        name: string
        overview: string
        first_air_date: string | null
        year: number | null
        poster_url: string | null
        backdrop_url: string | null
        imdb_id: string | null
        details_at: number | null
        cast_json: string | null
        trailers_json: string | null
      }
    | undefined
  if (!row) return null
  const seasons = db
    .prepare(
      `SELECT season_number, name, episode_count, air_date
       FROM seasons WHERE show_id = ? AND season_number > 0
       ORDER BY season_number`
    )
    .all(tmdbId) as {
    season_number: number
    name: string | null
    episode_count: number | null
    air_date: string | null
  }[]
  return {
    detailsAt: row.details_at,
    extrasStored: row.cast_json != null && row.trailers_json != null,
    details: {
      id: row.tmdb_id,
      name: row.name,
      overview: row.overview,
      firstAirYear: row.year ?? airYear(row.first_air_date),
      posterUrl: row.poster_url,
      backdropUrl: row.backdrop_url,
      imdbId: row.imdb_id,
      cast: parseCast(row.cast_json),
      trailers: parseTrailers(row.trailers_json),
      seasons: seasons.map((season) => ({
        seasonNumber: season.season_number,
        name: season.name || `Season ${season.season_number}`,
        episodeCount: season.episode_count ?? 0,
        airYear: airYear(season.air_date)
      }))
    }
  }
}

export function showsNeedingDetails(db: LibraryDb, limit: number, staleBefore: number): number[] {
  const rows = db
    .prepare(
      `SELECT tmdb_id FROM shows
       WHERE details_at IS NULL OR details_at < ?
       ORDER BY CASE WHEN list_seen_at IS NULL THEN 1 ELSE 0 END, list_seen_at DESC, tmdb_id DESC
       LIMIT ?`
    )
    .all(staleBefore, limit) as { tmdb_id: number }[]
  return rows.map((row) => row.tmdb_id)
}
