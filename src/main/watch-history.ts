import * as ElectronStoreModule from 'electron-store'
import { FINISHED_FRACTION, type WatchProgress } from '@shared/watch-history'

type StoreCtor = typeof import('electron-store').default

function getStoreConstructor(): StoreCtor {
  const exported = (ElectronStoreModule as { default?: unknown }).default
  if (typeof exported === 'function') return exported as StoreCtor
  if (
    exported !== null &&
    typeof exported === 'object' &&
    'default' in exported &&
    typeof (exported as { default: unknown }).default === 'function'
  ) {
    return (exported as { default: StoreCtor }).default
  }
  throw new Error('Could not load electron-store constructor.')
}

type StoreShape = {
  progress: Record<string, WatchProgress>
  watchlist: number[]
}

const store = new (getStoreConstructor())({
  name: 'popcorn-bucket-watch-history',
  defaults: { progress: {}, watchlist: [] } satisfies StoreShape
})

export function recordWatchProgress(movieId: number, position: number, duration: number): void {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return
  const finished = position / duration >= FINISHED_FRACTION
  const progress = { ...(store.get('progress') as StoreShape['progress']) }
  progress[String(movieId)] = {
    movieId,
    position: finished ? 0 : Math.max(0, position),
    duration,
    updatedAt: Date.now(),
    finished
  }
  store.set('progress', progress)
}

export function getWatchProgress(movieId: number): WatchProgress | null {
  const progress = store.get('progress') as StoreShape['progress']
  return progress[String(movieId)] ?? null
}

export function listWatchProgress(): WatchProgress[] {
  const progress = store.get('progress') as StoreShape['progress']
  return Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function clearWatchProgress(movieId: number): void {
  const progress = { ...(store.get('progress') as StoreShape['progress']) }
  delete progress[String(movieId)]
  store.set('progress', progress)
}

export function getWatchlist(): number[] {
  return [...(store.get('watchlist') as number[])]
}

export function setInWatchlist(movieId: number, inList: boolean): number[] {
  const list = getWatchlist().filter((id) => id !== movieId)
  if (inList) list.unshift(movieId)
  store.set('watchlist', list)
  return list
}
