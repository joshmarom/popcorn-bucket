import type { AppSettings } from '@shared/app-settings'
import type { TvShowListFacts } from '@shared/tv'
import { getLibrary } from './library/db'
import { readShowListFacts, type StoredShowListFacts } from './library/shows'
import { hasTmdbCredentials } from './tmdb'
import { getTvShowDetails } from './tmdb-tv'
import { mapWithConcurrency } from './torrent/map-with-concurrency'

/** Status and "last episode" change as a show airs, so stored facts are re-checked daily. */
const FACTS_FRESH_MS = 24 * 60 * 60 * 1000

const inflight = new Map<number, Promise<void>>()

function yearOf(date: string | null): number | null {
  const y = date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : NaN
  return Number.isInteger(y) && y > 0 ? y : null
}

function needsDetails(row: StoredShowListFacts | undefined, now: number): boolean {
  return row == null || row.factsAt == null || now - row.factsAt > FACTS_FRESH_MS
}

/** `getTvShowDetails` writes the facts to the library (creating the row if needed). */
function loadDetails(settings: AppSettings, id: number): Promise<void> {
  const existing = inflight.get(id)
  if (existing) return existing
  const job = getTvShowDetails(settings, id)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => inflight.delete(id))
  inflight.set(id, job)
  return job
}

function toFacts(id: number, row: StoredShowListFacts | undefined): TvShowListFacts {
  return {
    id,
    genres: row?.genres ?? [],
    seasonCount: row?.seasonCount ?? null,
    firstAirYear: row?.firstAirYear ?? null,
    lastAirYear: yearOf(row?.lastAirDate ?? null),
    tmdbStatus: row?.tmdbStatus ?? null,
    lastEpisodeAirDate: row?.lastEpisodeAirDate ?? null,
    voteAverage: row?.voteAverage ?? null
  }
}

/**
 * Season count and status are not on TMDB list payloads. Read what the library has, and fetch the
 * show record for cards whose facts are missing or older than a day.
 */
export async function fillTvShowListFacts(
  settings: AppSettings,
  ids: number[]
): Promise<TvShowListFacts[]> {
  const unique = [...new Set(ids)]
  const db = getLibrary()
  const now = Date.now()
  if (hasTmdbCredentials(settings) && unique.length > 0) {
    const stored = readShowListFacts(db, unique)
    const missing = unique.filter((id) => needsDetails(stored.get(id), now))
    await mapWithConcurrency(missing, 4, (id) => loadDetails(settings, id))
  }
  const stored = readShowListFacts(db, unique)
  return unique.map((id) => toFacts(id, stored.get(id)))
}
