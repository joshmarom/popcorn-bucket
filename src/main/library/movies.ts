import type { CatalogMovieDetails, CatalogTrailer } from '@shared/catalog'
import type { LibraryDb } from './db'
import { enqueueMediaFromUrls, stillUrlsForMovie } from './media-assets'
import { linkTorrentsForImdb } from './torrents'

export type LibraryCastMember = {
  id: number
  name: string
  character: string
  profileUrl: string | null
}

export type LibraryGenre = {
  id: number
  name: string
}

export type LibraryMovieWrite = {
  tmdbId: number
  title: string
  releaseDate: string | null
  imdbId: string | null
  overview: string
  posterUrl: string | null
  backdropUrl: string | null
  runtime: number | null
  rating: number | null
  voteCount?: number | null
  popularity?: number | null
  genres: LibraryGenre[]
  cast: LibraryCastMember[]
  tagline?: string
  trailers?: CatalogTrailer[]
  originCountry?: string[]
  titleOriginal?: string | null
  backdropUrls?: string[]
  omdb?: CatalogMovieDetails['omdb']
}

/** One row from a TMDB list endpoint (discover, now playing, find, search). */
export type LibraryMovieListRow = {
  tmdbId: number
  title: string
  releaseDate: string | null
  overview: string
  posterUrl: string | null
  backdropUrl?: string | null
  voteAverage: number | null
  voteCount: number | null
  popularity: number | null
  genreIds: number[]
  imdbId?: string | null
  originCountry?: string[]
  titleOriginal?: string | null
}

function releaseYear(releaseDate: string | null): number | null {
  if (!releaseDate || releaseDate.length < 4) return null
  const year = Number(releaseDate.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

function storedImdbId(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  return /^tt\d+$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed
}

function uniqueById<T extends { id: number }>(rows: T[]): T[] {
  const seen = new Set<number>()
  const unique: T[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }
  return unique
}

export function upsertMovie(db: LibraryDb, movie: LibraryMovieWrite): void {
  const imdbId = storedImdbId(movie.imdbId)
  const genres = uniqueById(movie.genres)
  const cast = uniqueById(movie.cast)
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO movies (
         tmdb_id, title, year, release_date, imdb_id, overview, poster_url, backdrop_url,
         runtime, rating, vote_count, tmdb_popularity, updated_at, details_at, tagline,
         trailers_json, origin_country_json, title_original, omdb_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         title = excluded.title,
         year = excluded.year,
         release_date = COALESCE(excluded.release_date, movies.release_date),
         imdb_id = COALESCE(excluded.imdb_id, movies.imdb_id),
         overview = excluded.overview,
         poster_url = COALESCE(excluded.poster_url, movies.poster_url),
         backdrop_url = COALESCE(excluded.backdrop_url, movies.backdrop_url),
         runtime = excluded.runtime,
         rating = excluded.rating,
         vote_count = COALESCE(excluded.vote_count, movies.vote_count),
         tmdb_popularity = COALESCE(excluded.tmdb_popularity, movies.tmdb_popularity),
         updated_at = excluded.updated_at,
         details_at = excluded.details_at,
         tagline = COALESCE(excluded.tagline, movies.tagline),
         trailers_json = COALESCE(excluded.trailers_json, movies.trailers_json),
         origin_country_json = COALESCE(excluded.origin_country_json, movies.origin_country_json),
         title_original = COALESCE(excluded.title_original, movies.title_original),
         omdb_json = COALESCE(excluded.omdb_json, movies.omdb_json)`
    ).run(
      movie.tmdbId,
      movie.title,
      releaseYear(movie.releaseDate),
      movie.releaseDate,
      imdbId,
      movie.overview,
      movie.posterUrl,
      movie.backdropUrl,
      movie.runtime,
      movie.rating,
      movie.voteCount ?? null,
      movie.popularity ?? null,
      Date.now(),
      Date.now(),
      movie.tagline ?? '',
      movie.trailers && movie.trailers.length > 0 ? JSON.stringify(movie.trailers) : null,
      movie.originCountry && movie.originCountry.length > 0
        ? JSON.stringify(movie.originCountry)
        : null,
      movie.titleOriginal ?? null,
      movie.omdb ? JSON.stringify(movie.omdb) : null
    )

    db.prepare('DELETE FROM movie_cast WHERE movie_id = ?').run(movie.tmdbId)
    db.prepare('DELETE FROM movie_genres WHERE movie_id = ?').run(movie.tmdbId)

    const upsertGenre = db.prepare(
      `INSERT INTO genres (tmdb_id, name) VALUES (?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name`
    )
    const linkGenre = db.prepare(
      'INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)'
    )
    for (const genre of genres) {
      upsertGenre.run(genre.id, genre.name)
      linkGenre.run(movie.tmdbId, genre.id)
    }

    const upsertPerson = db.prepare(
      `INSERT INTO people (tmdb_id, name, profile_url) VALUES (?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         name = excluded.name,
         profile_url = COALESCE(excluded.profile_url, people.profile_url)`
    )
    const linkCast = db.prepare(
      `INSERT INTO movie_cast (movie_id, person_id, character, billing_order)
       VALUES (?, ?, ?, ?)`
    )
    cast.forEach((person, billingOrder) => {
      upsertPerson.run(person.id, person.name, person.profileUrl)
      linkCast.run(movie.tmdbId, person.id, person.character, billingOrder)
    })

    if (imdbId) linkTorrentsForImdb(db, imdbId, movie.tmdbId)
    enqueueMediaFromUrls(db, {
      tmdbId: movie.tmdbId,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      stillUrls: movie.backdropUrls,
      profileUrls: cast.map((person) => person.profileUrl).filter((url): url is string => !!url)
    })
  })
  run()
}

export function upsertGenres(db: LibraryDb, genres: LibraryGenre[]): void {
  const upsert = db.prepare(
    `INSERT INTO genres (tmdb_id, name) VALUES (?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name`
  )
  const run = db.transaction(() => {
    for (const genre of uniqueById(genres)) upsert.run(genre.id, genre.name)
  })
  run()
}

/**
 * Records TMDB list rows without overwriting what `getMovieDetails` saved.
 * Genre ids TMDB has not named yet are skipped.
 */
export function upsertMovieListRows(
  db: LibraryDb,
  rows: LibraryMovieListRow[],
  seenAt = Date.now()
): void {
  const upsert = db.prepare(
    `INSERT INTO movies (
       tmdb_id, title, year, release_date, imdb_id, overview, poster_url, backdrop_url,
       rating, vote_count, tmdb_popularity, list_seen_at, updated_at,
       origin_country_json, title_original
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       title = excluded.title,
       year = COALESCE(excluded.year, movies.year),
       release_date = COALESCE(excluded.release_date, movies.release_date),
       imdb_id = COALESCE(movies.imdb_id, excluded.imdb_id),
       overview = CASE WHEN movies.overview = '' THEN excluded.overview ELSE movies.overview END,
       poster_url = COALESCE(movies.poster_url, excluded.poster_url),
       backdrop_url = COALESCE(movies.backdrop_url, excluded.backdrop_url),
       rating = COALESCE(excluded.rating, movies.rating),
       vote_count = COALESCE(excluded.vote_count, movies.vote_count),
       tmdb_popularity = COALESCE(excluded.tmdb_popularity, movies.tmdb_popularity),
       list_seen_at = excluded.list_seen_at,
       origin_country_json = COALESCE(movies.origin_country_json, excluded.origin_country_json),
       title_original = COALESCE(movies.title_original, excluded.title_original)`
  )
  const linkGenre = db.prepare(
    `INSERT OR IGNORE INTO movie_genres (movie_id, genre_id)
     SELECT ?, tmdb_id FROM genres WHERE tmdb_id = ?`
  )
  const run = db.transaction(() => {
    for (const row of rows) {
      const imdbId = storedImdbId(row.imdbId ?? null)
      upsert.run(
        row.tmdbId,
        row.title,
        releaseYear(row.releaseDate),
        row.releaseDate,
        imdbId,
        row.overview,
        row.posterUrl,
        row.backdropUrl ?? null,
        row.voteAverage,
        row.voteCount,
        row.popularity,
        seenAt,
        seenAt,
        row.originCountry && row.originCountry.length > 0
          ? JSON.stringify(row.originCountry)
          : null,
        row.titleOriginal ?? null
      )
      for (const genreId of new Set(row.genreIds)) linkGenre.run(row.tmdbId, genreId)
      if (imdbId) linkTorrentsForImdb(db, imdbId, row.tmdbId)
      enqueueMediaFromUrls(db, {
        tmdbId: row.tmdbId,
        posterUrl: row.posterUrl,
        backdropUrl: row.backdropUrl
      })
    }
  })
  run()
}

export function genreNameById(db: LibraryDb): Map<number, string> {
  const rows = db.prepare('SELECT tmdb_id, name FROM genres').all() as {
    tmdb_id: number
    name: string
  }[]
  return new Map(rows.map((row) => [row.tmdb_id, row.name]))
}

function movieIdPlaceholders(ids: number[]): { unique: number[]; clause: string } | null {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return null
  return { unique, clause: unique.map(() => '?').join(',') }
}

export function runtimesByMovieId(db: LibraryDb, movieIds: number[]): Map<number, number | null> {
  const params = movieIdPlaceholders(movieIds)
  const out = new Map<number, number | null>()
  if (!params) return out
  const rows = db
    .prepare(`SELECT tmdb_id, runtime FROM movies WHERE tmdb_id IN (${params.clause})`)
    .all(...params.unique) as { tmdb_id: number; runtime: number | null }[]
  for (const row of rows) out.set(row.tmdb_id, row.runtime)
  return out
}

export function genresByMovieId(db: LibraryDb, movieIds: number[]): Map<number, string[]> {
  const params = movieIdPlaceholders(movieIds)
  const out = new Map<number, string[]>()
  if (!params) return out
  const rows = db
    .prepare(
      `SELECT mg.movie_id, g.name
       FROM movie_genres mg
       JOIN genres g ON g.tmdb_id = mg.genre_id
       WHERE mg.movie_id IN (${params.clause})
       ORDER BY g.name`
    )
    .all(...params.unique) as { movie_id: number; name: string }[]
  for (const row of rows) {
    const names = out.get(row.movie_id) ?? []
    names.push(row.name)
    out.set(row.movie_id, names)
  }
  return out
}

export type StoredMovieListFacts = {
  runtime: number | null
  voteAverage: number | null
  genres: string[]
}

export function readMovieListFacts(
  db: LibraryDb,
  movieIds: number[]
): Map<number, StoredMovieListFacts> {
  const params = movieIdPlaceholders(movieIds)
  const out = new Map<number, StoredMovieListFacts>()
  if (!params) return out
  const rows = db
    .prepare(`SELECT tmdb_id, runtime, rating FROM movies WHERE tmdb_id IN (${params.clause})`)
    .all(...params.unique) as { tmdb_id: number; runtime: number | null; rating: number | null }[]
  const genres = genresByMovieId(db, params.unique)
  for (const row of rows) {
    out.set(row.tmdb_id, {
      runtime: row.runtime,
      voteAverage: row.rating,
      genres: genres.get(row.tmdb_id) ?? []
    })
  }
  return out
}

/** Fills runtime and genre links on a movie already stored from a list row. */
export function saveMovieListCore(
  db: LibraryDb,
  tmdbId: number,
  core: { runtime: number | null; voteAverage: number | null; genres: LibraryGenre[] }
): void {
  const exists = db.prepare('SELECT 1 AS ok FROM movies WHERE tmdb_id = ?').get(tmdbId)
  if (!exists) return
  const runtime = core.runtime != null && core.runtime > 0 ? core.runtime : null
  const rating = core.voteAverage != null && core.voteAverage > 0 ? core.voteAverage : null
  const genres = uniqueById(core.genres).flatMap((genre) => {
    const name = genre.name.trim()
    return name ? [{ id: genre.id, name }] : []
  })
  const run = db.transaction(() => {
    db.prepare(
      `UPDATE movies SET
         runtime = COALESCE(runtime, ?),
         rating = COALESCE(rating, ?)
       WHERE tmdb_id = ?`
    ).run(runtime, rating, tmdbId)
    const upsertGenre = db.prepare(
      `INSERT INTO genres (tmdb_id, name) VALUES (?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name`
    )
    const linkGenre = db.prepare(
      'INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)'
    )
    for (const genre of genres) {
      upsertGenre.run(genre.id, genre.name)
      linkGenre.run(tmdbId, genre.id)
    }
  })
  run()
}

type StoredMovieRow = {
  tmdb_id: number
  title: string
  overview: string
  tagline: string | null
  runtime: number | null
  release_date: string | null
  rating: number | null
  poster_url: string | null
  backdrop_url: string | null
  imdb_id: string | null
  trailers_json: string | null
  omdb_json: string | null
  details_at: number | null
}

function parseJsonArray<T>(raw: string | null, guard: (value: unknown) => value is T): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(guard) : []
  } catch {
    return []
  }
}

function isTrailer(value: unknown): value is CatalogTrailer {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CatalogTrailer).name === 'string' &&
    typeof (value as CatalogTrailer).youtubeKey === 'string'
  )
}

export type StoredMovieDetails = {
  details: CatalogMovieDetails
  detailsAt: number | null
}

export function readStoredMovieDetails(db: LibraryDb, tmdbId: number): StoredMovieDetails | null {
  const row = db
    .prepare(
      `SELECT tmdb_id, title, overview, tagline, runtime, release_date, rating,
              poster_url, backdrop_url, imdb_id, trailers_json, omdb_json, details_at
       FROM movies WHERE tmdb_id = ?`
    )
    .get(tmdbId) as StoredMovieRow | undefined
  if (!row) return null
  const genres = genresByMovieId(db, [tmdbId]).get(tmdbId) ?? []
  const castRows = db
    .prepare(
      `SELECT p.name, mc.character, p.profile_url
       FROM movie_cast mc
       JOIN people p ON p.tmdb_id = mc.person_id
       WHERE mc.movie_id = ?
       ORDER BY mc.billing_order`
    )
    .all(tmdbId) as { name: string; character: string | null; profile_url: string | null }[]
  const stills = stillUrlsForMovie(db, tmdbId)
  const backdropUrls =
    stills.length > 0 ? stills : row.backdrop_url ? [row.backdrop_url] : []
  let omdb: CatalogMovieDetails['omdb'] = null
  if (row.omdb_json) {
    try {
      omdb = JSON.parse(row.omdb_json) as CatalogMovieDetails['omdb']
    } catch {
      omdb = null
    }
  }
  return {
    detailsAt: row.details_at,
    details: {
      id: row.tmdb_id,
      title: row.title,
      tagline: row.tagline ?? '',
      overview: row.overview,
      runtime: row.runtime,
      releaseDate: row.release_date,
      voteAverage: row.rating,
      posterUrl: row.poster_url,
      backdropUrl: row.backdrop_url,
      backdropUrls,
      genres,
      cast: castRows.map((person) => ({
        name: person.name,
        character: person.character ?? '',
        profileUrl: person.profile_url
      })),
      trailers: parseJsonArray(row.trailers_json, isTrailer),
      imdbId: row.imdb_id,
      omdb
    }
  }
}

export function moviesNeedingDetails(db: LibraryDb, limit: number, staleBefore: number): number[] {
  const rows = db
    .prepare(
      `SELECT tmdb_id FROM movies
       WHERE details_at IS NULL OR details_at < ?
       ORDER BY CASE WHEN list_seen_at IS NULL THEN 1 ELSE 0 END, list_seen_at DESC, tmdb_id DESC
       LIMIT ?`
    )
    .all(staleBefore, limit) as { tmdb_id: number }[]
  return rows.map((row) => row.tmdb_id)
}
