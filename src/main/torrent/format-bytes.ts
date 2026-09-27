export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let u = 0
  let n = bytes
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  const rounded = u === 0 ? Math.round(n) : n < 10 ? Number(n.toFixed(1)) : Math.round(n)
  return `${rounded} ${units[u]}`
}
