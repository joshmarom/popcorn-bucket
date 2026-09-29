import { FINISHED_FRACTION, type WatchProgress } from '@shared/watch-history'
import { apiJson } from './api-client'

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
  const rows = await listWatchProgress()
  return rows.find((row) => row.movieId === movieId) ?? null
}

export async function listWatchProgress(): Promise<WatchProgress[]> {
  const result = await apiJson<HistoryResponse>('/v1/me/history')
  if (!result.ok) return []
  return result.items.filter((item) => item.mediaType === 'movie').map(toProgress)
}

export async function clearWatchProgress(movieId: number): Promise<void> {
  await apiJson(`/v1/me/history?mediaType=movie&tmdbId=${movieId}`, { method: 'DELETE' })
}

export async function getWatchlist(): Promise<number[]> {
  const result = await apiJson<WatchlistResponse>('/v1/me/watchlist')
  return result.ok ? result.movies : []
}

export async function setInWatchlist(movieId: number, inList: boolean): Promise<number[]> {
  await apiJson('/v1/me/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ mediaType: 'movie', tmdbId: movieId, inList })
  })
  return getWatchlist()
}

export async function getShowWatchlist(): Promise<number[]> {
  const result = await apiJson<WatchlistResponse>('/v1/me/watchlist')
  return result.ok ? result.shows : []
}

export async function setShowInWatchlist(showId: number, inList: boolean): Promise<number[]> {
  await apiJson('/v1/me/watchlist', {
    method: 'PUT',
    body: JSON.stringify({ mediaType: 'show', tmdbId: showId, inList })
  })
  return getShowWatchlist()
}
