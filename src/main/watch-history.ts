import type { WatchProgress } from '@shared/watch-history'
import { getLibrary } from './library/db'
import {
  clearWatchProgress as clearStoredWatchProgress,
  getWatchProgress as readStoredWatchProgress,
  getWatchlist as readStoredWatchlist,
  listWatchProgress as listStoredWatchProgress,
  recordWatchProgress as recordStoredWatchProgress,
  setInWatchlist as setStoredWatchlist
} from './library/watch'

export function recordWatchProgress(movieId: number, position: number, duration: number): void {
  recordStoredWatchProgress(getLibrary(), movieId, position, duration)
}

export function getWatchProgress(movieId: number): WatchProgress | null {
  return readStoredWatchProgress(getLibrary(), movieId)
}

export function listWatchProgress(): WatchProgress[] {
  return listStoredWatchProgress(getLibrary())
}

export function clearWatchProgress(movieId: number): void {
  clearStoredWatchProgress(getLibrary(), movieId)
}

export function getWatchlist(): number[] {
  return readStoredWatchlist(getLibrary())
}

export function setInWatchlist(movieId: number, inList: boolean): number[] {
  return setStoredWatchlist(getLibrary(), movieId, inList)
}
