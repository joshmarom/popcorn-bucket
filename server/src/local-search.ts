import type { CatalogMovieListItem } from '../../src/shared/catalog'
import type { TvShowListItem } from '../../src/shared/tv'
import { getPool } from './db'

function ftsQuery(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length < 2) return null
  return trimmed.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim() || null
}

export async function searchMoviesLocal(query: string, limit = 40): Promise<CatalogMovieListItem[]> {
  const q = ftsQuery(query)
  if (!q) return []
  try {
    const result = await getPool().query<{
      tmdb_id: number
      title: string
      release_date: string | null
      year: number | null
      rating: number | null
      tmdb_popularity: number | null
      poster_url: string | null
      overview: string
      runtime: number | null
    }>(
      `SELECT tmdb_id, title, release_date, year, rating, tmdb_popularity, poster_url, overview, runtime
       FROM movies
       WHERE search_tsv @@ plainto_tsquery('simple', $1)
       ORDER BY ts_rank(search_tsv, plainto_tsquery('simple', $1)) DESC, tmdb_id DESC
       LIMIT $2`,
      [q, limit]
    )
    return result.rows.map((row) => ({
      id: row.tmdb_id,
      title: row.title,
      releaseDate: row.release_date,
      releaseYear: row.year,
      voteAverage: row.rating,
      popularity: row.tmdb_popularity,
      posterUrl: row.poster_url,
      overview: row.overview ?? '',
      genres: [],
      runtime: row.runtime
    }))
  } catch {
    return []
  }
}

export async function searchShowsLocal(query: string, limit = 40): Promise<TvShowListItem[]> {
  const q = ftsQuery(query)
  if (!q) return []
  try {
    const result = await getPool().query<{
      tmdb_id: number
      name: string
      year: number | null
      poster_url: string | null
      overview: string
      rating: number | null
      genres_json: string | null
    }>(
      `SELECT tmdb_id, name, year, poster_url, overview, rating, genres_json
       FROM shows
       WHERE search_tsv @@ plainto_tsquery('simple', $1)
       ORDER BY ts_rank(search_tsv, plainto_tsquery('simple', $1)) DESC, tmdb_id DESC
       LIMIT $2`,
      [q, limit]
    )
    return result.rows.map((row) => {
      let genres: string[] = []
      try {
        const parsed = row.genres_json ? (JSON.parse(row.genres_json) as unknown) : []
        genres = Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
      } catch {
        genres = []
      }
      return {
        id: row.tmdb_id,
        name: row.name,
        firstAirYear: row.year,
        posterUrl: row.poster_url,
        overview: row.overview ?? '',
        voteAverage: row.rating,
        genres
      }
    })
  } catch {
    return []
  }
}

export function mergeById<T extends { id: number }>(primary: T[], extra: T[]): T[] {
  const seen = new Set(primary.map((item) => item.id))
  const out = [...primary]
  for (const item of extra) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}
