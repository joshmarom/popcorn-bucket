import type { AppSettings } from '@shared/app-settings'
import type { CatalogMovieListFacts } from '@shared/catalog'
import { z } from 'zod'
import { getLibrary } from './library/db'
import { readMovieListFacts, saveMovieListCore } from './library/movies'
import { hasTmdbCredentials, tmdbFetchJson } from './tmdb'
import { mapWithConcurrency } from './torrent/map-with-concurrency'

const movieCoreSchema = z.object({
  runtime: z.number().nullable().optional(),
  vote_average: z.number().optional(),
  genres: z
    .array(
      z.object({
        id: z.number(),
        name: z.string()
      })
    )
    .optional()
})

type FetchedCore = {
  runtime: number | null
  voteAverage: number | null
  genres: string[]
}

const inflight = new Map<number, Promise<FetchedCore | null>>()

function positiveOrNull(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null
}

async function loadMovieCore(settings: AppSettings, tmdbId: number): Promise<FetchedCore | null> {
  const existing = inflight.get(tmdbId)
  if (existing) return existing
  const job = (async (): Promise<FetchedCore | null> => {
    const json = await tmdbFetchJson(
      settings,
      `/movie/${tmdbId}`,
      {},
      { cacheTtlMs: 1000 * 60 * 60 * 24 }
    )
    const parsed = movieCoreSchema.safeParse(json)
    if (!parsed.success) return null
    const genres = (parsed.data.genres ?? []).flatMap((genre) => {
      const name = genre.name.trim()
      return name ? [{ id: genre.id, name }] : []
    })
    const core = {
      runtime: positiveOrNull(parsed.data.runtime),
      voteAverage: positiveOrNull(parsed.data.vote_average),
      genres
    }
    saveMovieListCore(getLibrary(), tmdbId, core)
    return {
      runtime: core.runtime,
      voteAverage: core.voteAverage,
      genres: genres.map((genre) => genre.name)
    }
  })().finally(() => {
    inflight.delete(tmdbId)
  })
  inflight.set(tmdbId, job)
  return job
}

/**
 * Runtime is not on TMDB list payloads. Read what the library already has, and fetch the
 * movie record for anything still missing a runtime or genre names.
 */
export async function fillCatalogMovieListFacts(
  settings: AppSettings,
  ids: number[]
): Promise<CatalogMovieListFacts[]> {
  const unique = [...new Set(ids)]
  const db = getLibrary()
  const fetched = new Map<number, FetchedCore>()
  if (hasTmdbCredentials(settings) && unique.length > 0) {
    const stored = readMovieListFacts(db, unique)
    const missing = unique.filter((id) => {
      const row = stored.get(id)
      return row == null || row.runtime == null || row.genres.length === 0
    })
    const loaded = await mapWithConcurrency(missing, 4, async (id) => {
      try {
        return await loadMovieCore(settings, id)
      } catch {
        return null
      }
    })
    missing.forEach((id, index) => {
      const core = loaded[index]
      if (core) fetched.set(id, core)
    })
  }

  const stored = readMovieListFacts(db, unique)
  return unique.map((id) => {
    const row = stored.get(id)
    const extra = fetched.get(id)
    return {
      id,
      runtime: row?.runtime ?? extra?.runtime ?? null,
      genres: row && row.genres.length > 0 ? row.genres : (extra?.genres ?? []),
      voteAverage: row?.voteAverage ?? extra?.voteAverage ?? null
    }
  })
}
