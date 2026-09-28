import type { LibraryDb } from './db'
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
}

/** One row from a TMDB list endpoint (discover, now playing, find, search). */
export type LibraryMovieListRow = {
  tmdbId: number
  title: string
  releaseDate: string | null
  overview: string
  posterUrl: string | null
  voteAverage: number | null
  voteCount: number | null
  popularity: number | null
  genreIds: number[]
  imdbId?: string | null
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
         runtime, rating, vote_count, tmdb_popularity, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         updated_at = excluded.updated_at`
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
      Date.now()
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
       tmdb_id, title, year, release_date, imdb_id, overview, poster_url,
       rating, vote_count, tmdb_popularity, list_seen_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET
       title = excluded.title,
       year = COALESCE(excluded.year, movies.year),
       release_date = COALESCE(excluded.release_date, movies.release_date),
       imdb_id = COALESCE(movies.imdb_id, excluded.imdb_id),
       overview = CASE WHEN movies.overview = '' THEN excluded.overview ELSE movies.overview END,
       poster_url = COALESCE(movies.poster_url, excluded.poster_url),
       rating = COALESCE(excluded.rating, movies.rating),
       vote_count = COALESCE(excluded.vote_count, movies.vote_count),
       tmdb_popularity = COALESCE(excluded.tmdb_popularity, movies.tmdb_popularity),
       list_seen_at = excluded.list_seen_at`
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
        row.voteAverage,
        row.voteCount,
        row.popularity,
        seenAt,
        seenAt
      )
      for (const genreId of new Set(row.genreIds)) linkGenre.run(row.tmdbId, genreId)
      if (imdbId) linkTorrentsForImdb(db, imdbId, row.tmdbId)
    }
  })
  run()
}
