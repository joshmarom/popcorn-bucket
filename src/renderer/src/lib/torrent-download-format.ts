import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n === 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let u = 0
  let v = n
  while (v >= k && u < units.length - 1) {
    v /= k
    u++
  }
  const rounded = u === 0 ? Math.round(v) : v < 10 ? Number(v.toFixed(1)) : Math.round(v)
  return `${rounded} ${units[u]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function statusLabel(status: MovieTorrentDownloadSnapshot['status']): string {
  switch (status) {
    case 'pending_metadata':
      return 'Fetching metadata'
    case 'downloading':
      return 'Downloading'
    case 'paused':
      return 'Paused'
    case 'complete':
      return 'Complete'
    case 'error':
      return 'Error'
    default:
      return status
  }
}
