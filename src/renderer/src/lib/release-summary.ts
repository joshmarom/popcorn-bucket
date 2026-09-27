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
