import type { ReleaseCodec, ReleaseResolution, ReleaseSource } from './release-info'
import type { TorrentSource } from './torrent'

const RESOLUTION_RANK: Record<ReleaseResolution, number> = {
  '2160p': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1
}

/** Higher is a cleaner source. Cam, telesync, and screener stay at the bottom. */
const SOURCE_RANK: Record<ReleaseSource, number> = {
  remux: 8,
  bluray: 7,
  web: 6,
  hdtv: 5,
  dvd: 4,
  screener: 2,
  telesync: 1,
  cam: 0
}

const CODEC_RANK: Record<ReleaseCodec, number> = {
  av1: 3,
  x265: 2,
  x264: 1
}

/**
 * Sort key for the Quality column. Resolution wins, then source, HDR, codec,
 * then the TorrentClaw score shown on the badge. Unknown fields sort last
 * when the column is descending.
 */
export function qualitySortScore(row: TorrentSource): number {
  const release = row.release
  const resolution = release.resolution ? RESOLUTION_RANK[release.resolution] : 0
  const source = release.source ? SOURCE_RANK[release.source] : 0
  const codec = release.codec ? CODEC_RANK[release.codec] : 0
  const hdr = release.hdr || row.quality?.hdr ? 1 : 0
  const claw = Math.max(0, Math.min(100, row.quality?.score ?? 0))
  return resolution * 1_000_000 + source * 10_000 + hdr * 1_000 + codec * 100 + claw
}

/**
 * Sort key for the combined seeders/leechers column.
 *
 * Effective seeders: the seeder count scaled by that swarm's seeder share.
 *   S * (S + 1) / (S + L + 1)
 *
 * Same seeders with fewer leechers rank higher. A large balanced swarm still
 * beats a tiny swarm with no leechers, and a swarm with no seeders scores 0.
 */
export function swarmRatioScore(seeders: number, leechers: number): number {
  const seed = Math.max(0, seeders)
  const leech = Math.max(0, leechers)
  return (seed * (seed + 1)) / (seed + leech + 1)
}
