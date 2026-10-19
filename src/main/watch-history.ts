import { FINISHED_FRACTION, type WatchProgress } from '@shared/watch-history'
import { apiJson, authStatus } from './api-client'
import { getLibrary } from './library/db'
import {
  getShowWatchlist as getLocalShowWatchlist,
  setShowInWatchlist as setLocalShowInWatchlist
} from './library/shows'
import {
  clearWatchProgress as clearLocalWatchProgress,
  getWatchProgress as getLocalWatchProgress,
  getWatchlist as getLocalWatchlist,
  listWatchProgress as listLocalWatchProgress,
  recordWatchProgress as recordLocalWatchProgress,
  setInWatchlist as setLocalInWatchlist
} from './library/watch'

type HistoryItem = {
  mediaType: 'movie' | 'show'
  tmdbId: number
  season: number | null
  episode: number | null
  position: number
  duration: number
  finished: boolean
  updatedAt: number
}

type HistoryResponse = { ok: true; items: HistoryItem[] } | { ok: false; error: string }
type WatchlistResponse =
  | { ok: true; movies: number[]; shows: number[] }
  | { ok: false; error: string }

function signedIn(): boolean {
  return authStatus().signedIn
}

function toProgress(item: HistoryItem): WatchProgress {
  return {
    movieId: item.tmdbId,
    position: item.position,
    duration: item.duration,
    updatedAt: item.updatedAt,
    finished: item.finished
  }
}

export async function recordWatchProgress(
  movieId: number,
  position: number,
  duration: number
): Promise<void> {
  if (!signedIn()) {
    recordLocalWatchProgress(getLibrary(), movieId, position, duration)
    return
  }
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
  const finished = position / duration >= FINISHED_FRACTION
  await apiJson('/v1/me/history', {
    method: 'POST',
    body: JSON.stringify({
      mediaType: 'movie',
      tmdbId: movieId,
      position: finished ? 0 : Math.max(0, position),
      duration,
      finished
    })
  })
}

export async function getWatchProgress(movieId: number): Promise<WatchProgress | null> {
  if (!signedIn()) return getLocalWatchProgress(getLibrary(), movieId)
  const rows = await listWatchProgress()
  return rows.find((row) => row.movieId === movieId) ?? null
}

export async function listWatchProgress(): Promise<WatchProgress[]> {
  if (!signedIn()) return listLocalWatchProgress(getLibrary())
  const result = await apiJson<HistoryResponse>('/v1/me/history')
  if (!result.ok) return []
  return result.items.filter((item) => item.mediaType === 'movie').map(toProgress)
}

export async function clearWatchProgress(movieId: number): Promise<void> {
  if (!signedIn()) {
    clearLocalWatchProgress(getLibrary(), movieId)
    return
  }
  await apiJson(`/v1/me/history?mediaType=movie&tmdbId=${movieId}`, { method: 'DELETE' })
}

export async function getWatchlist(): Promise<number[]> {
  if (!signedIn()) return getLocalWatchlist(getLibrary())
  const result = await apiJson<WatchlistResponse>('/v1/me/watchlist')
  return result.ok ? result.movies : []
}

export async function setInWatchlist(movieId: number, inList: boolean): Promise<number[]> {
  if (!signedIn()) return setLocalInWatchlist(getLibrary(), movieId, inList)
  await apiJson('/v1/me/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ mediaType: 'movie', tmdbId: movieId, inList })
  })
  return getWatchlist()
}

export async function getShowWatchlist(): Promise<number[]> {
  if (!signedIn()) return getLocalShowWatchlist(getLibrary())
  const result = await apiJson<WatchlistResponse>('/v1/me/watchlist')
  return result.ok ? result.shows : []
}

export async function setShowInWatchlist(showId: number, inList: boolean): Promise<number[]> {
  if (!signedIn()) return setLocalShowInWatchlist(getLibrary(), showId, inList)
  await apiJson('/v1/me/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ mediaType: 'show', tmdbId: showId, inList })
  })
  return getShowWatchlist()
}
