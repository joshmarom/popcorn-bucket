export const RELEASES_URL = 'https://github.com/joshmarom/popcorn-bucket/releases/latest'
export const GITHUB_URL = 'https://github.com/joshmarom/popcorn-bucket'

export type DownloadOs = 'mac' | 'windows' | 'linux'

export type DownloadAsset = {
  os: DownloadOs
  label: string
  name: string
  url: string
  size: number
}

export type DownloadsPayload =
  | { ok: true; version: string; assets: DownloadAsset[] }
  | { ok: false; error: string }

const OS_NAMES: Record<DownloadOs, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux'
}

export function detectOs(userAgent: string): DownloadOs | 'other' {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return 'other'
  if (/Mac/i.test(userAgent)) return 'mac'
  if (/Win/i.test(userAgent)) return 'windows'
  if (/Linux/i.test(userAgent)) return 'linux'
  return 'other'
}

export function primaryAsset(
  os: DownloadOs | 'other',
  assets: DownloadAsset[]
): DownloadAsset | null {
  if (os === 'other') return assets[0] ?? null
  const mine = assets.filter((asset) => asset.os === os)
  if (os === 'linux') {
    return (
      mine.find((asset) => asset.name.endsWith('.AppImage')) ??
      mine.find((asset) => asset.name.endsWith('.deb')) ??
      mine[0] ??
      null
    )
  }
  return mine[0] ?? null
}

export function downloadLabel(asset: DownloadAsset | null): string {
  if (!asset) return 'Get it on GitHub'
  return `Download for ${OS_NAMES[asset.os]}`
}

export function assetNote(asset: DownloadAsset): string {
  if (asset.os === 'mac') return 'For Apple silicon Macs'
  if (asset.os === 'windows') return 'For Windows 10 and 11'
  return asset.label
}

export function otherPlatformLabel(asset: DownloadAsset): string {
  return asset.os === 'mac' ? 'macOS' : asset.label
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  if (mb < 10) return `${mb.toFixed(1)} MB`
  return `${Math.round(mb)} MB`
}
