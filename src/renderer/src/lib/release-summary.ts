import type { TorrentSource } from '@shared/torrent'

const SOURCE_LABEL: Record<string, string> = {
  remux: 'Remux',
  bluray: 'Blu-ray',
  web: 'WEB',
  hdtv: 'HDTV',
  dvd: 'DVD',
  screener: 'Screener',
  telesync: 'Telesync',
  cam: 'Cam'
}

/**
 * A copy described in two tiers: `quality` is what decides how it looks
 * (`1080p · Blu-ray · HDR`), `details` is what decides whether it will play well
 * (`x265 · 2.1 GB · 340 seeders`).
 */
export function releaseParts(row: TorrentSource): { quality: string; details: string } {
  const r = row.release
  return {
    quality: [r.resolution, r.source ? SOURCE_LABEL[r.source] : null, r.hdr ? 'HDR' : null]
      .filter(Boolean)
      .join(' · '),
    details: [r.codec, row.size, `${row.seeders} seeder${row.seeders === 1 ? '' : 's'}`]
      .filter(Boolean)
      .join(' · ')
  }
}

/** Short human label such as `1080p · Blu-ray · x265 · 2.1 GB · 340 seeders`. */
export function releaseSummary(row: TorrentSource): string {
  const r = row.release
  return [
    r.resolution,
    r.source ? SOURCE_LABEL[r.source] : null,
    r.codec,
    r.hdr ? 'HDR' : null,
    row.size,
    `${row.seeders} seeder${row.seeders === 1 ? '' : 's'}`
  ]
    .filter(Boolean)
    .join(' · ')
}
