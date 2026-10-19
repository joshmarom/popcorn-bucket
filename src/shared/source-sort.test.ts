import { describe, expect, it } from 'vitest'
import { qualitySortScore, swarmRatioScore } from './source-sort'
import { withReleaseInfo, type TorrentQualityInfo, type TorrentSource } from './torrent'

function row(title: string, quality?: Partial<TorrentQualityInfo>): TorrentSource {
  const source = withReleaseInfo({
    title,
    providerName: 'Test',
    size: '2 GB',
    seeders: 1,
    leechers: 0,
    magnetUri: null,
    torrentFileUrl: null,
    detailsUrl: null,
    uploadDate: null
  })
  if (!quality) return source
  return {
    ...source,
    quality: {
      score: null,
      verified: false,
      hdr: null,
      videoCodec: null,
      videoHeight: null,
      audioTracks: [],
      subtitleLangs: [],
      languages: [],
      releaseGroup: null,
      ...quality
    }
  }
}

describe('qualitySortScore', () => {
  it('ranks higher resolutions above cleaner lower-resolution sources', () => {
    const uhdCam = qualitySortScore(row('Movie 2160p CAM'))
    const bluray = qualitySortScore(row('Movie 1080p BluRay'))
    expect(uhdCam).toBeGreaterThan(bluray)
  })

  it('ranks source, then HDR, within the same resolution', () => {
    const remux = qualitySortScore(row('Movie 1080p REMUX'))
    const webHdr = qualitySortScore(row('Movie 1080p WEB-DL HDR'))
    const web = qualitySortScore(row('Movie 1080p WEB-DL'))
    const cam = qualitySortScore(row('Movie 1080p CAM'))
    expect(remux).toBeGreaterThan(webHdr)
    expect(webHdr).toBeGreaterThan(web)
    expect(web).toBeGreaterThan(cam)
  })

  it('uses the TorrentClaw score only as a tiebreak', () => {
    const low = qualitySortScore(row('Movie 1080p BluRay', { score: 10 }))
    const high = qualitySortScore(row('Movie 1080p BluRay', { score: 90 }))
    const betterSource = qualitySortScore(row('Movie 1080p REMUX', { score: 10 }))
    expect(high).toBeGreaterThan(low)
    expect(betterSource).toBeGreaterThan(high)
  })
})

describe('swarmRatioScore', () => {
  it('scores a swarm with no seeders at zero', () => {
    expect(swarmRatioScore(0, 0)).toBe(0)
    expect(swarmRatioScore(0, 40)).toBe(0)
  })

  it('prefers fewer leechers when seeder counts match', () => {
    expect(swarmRatioScore(100, 0)).toBeGreaterThan(swarmRatioScore(100, 1))
    expect(swarmRatioScore(100, 1)).toBeGreaterThan(swarmRatioScore(100, 100))
  })

  it('keeps a large balanced swarm ahead of a tiny perfect ratio', () => {
    expect(swarmRatioScore(100, 100)).toBeGreaterThan(swarmRatioScore(10, 0))
    expect(swarmRatioScore(1000, 10)).toBeGreaterThan(swarmRatioScore(100, 0))
  })
})
