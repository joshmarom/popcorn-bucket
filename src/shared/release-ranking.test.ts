import { describe, expect, it } from 'vitest'
import { matchesMovie, rankTorrentSources } from './release-ranking'
import { withReleaseInfo, type TorrentSource } from './torrent'

function row(title: string, seeders: number, size = '2 GB'): TorrentSource {
  return withReleaseInfo({
    title,
    providerName: 'Test',
    size,
    seeders,
    leechers: 0,
    magnetUri: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
    torrentFileUrl: null,
    detailsUrl: null,
    uploadDate: null
  })
}

const ctx = { movieTitle: 'The Matrix', movieYear: 1999 }

describe('matchesMovie', () => {
  it('requires the title words and a close year', () => {
    expect(matchesMovie(row('The.Matrix.1999.1080p.BluRay.x264', 10), ctx)).toBe(true)
    expect(matchesMovie(row('Matrix 1999 720p', 10), ctx)).toBe(true)
    expect(matchesMovie(row('The Matrix Reloaded 2003 1080p', 10), ctx)).toBe(false)
    expect(matchesMovie(row('The Animatrix 2003', 10), ctx)).toBe(false)
  })

  it('accepts rows without a year', () => {
    expect(matchesMovie(row('The Matrix 1080p WEB', 10), ctx)).toBe(true)
  })
})

describe('rankTorrentSources', () => {
  it('puts the preferred resolution ahead of a better-seeded cam copy', () => {
    const { ranked, excluded } = rankTorrentSources(
      [
        row('The Matrix 1999 HDCAM', 5000),
        row('The Matrix 1999 720p WEB x264', 400),
        row('The Matrix 1999 1080p BluRay x264', 120)
      ],
      ctx
    )
    expect(ranked.map((r) => r.title)).toEqual([
      'The Matrix 1999 1080p BluRay x264',
      'The Matrix 1999 720p WEB x264'
    ])
    expect(excluded.map((r) => r.title)).toEqual(['The Matrix 1999 HDCAM'])
  })

  it('pushes dead torrents and tiny samples down', () => {
    const { ranked } = rankTorrentSources(
      [
        row('The Matrix 1999 1080p BluRay', 0),
        row('The Matrix 1999 1080p BluRay sample', 300, '50 MB'),
        row('The Matrix 1999 1080p WEB', 40)
      ],
      ctx
    )
    expect(ranked[0]!.title).toBe('The Matrix 1999 1080p WEB')
  })

  it('honours a 2160p preference', () => {
    const { ranked } = rankTorrentSources(
      [
        row('The Matrix 1999 1080p BluRay', 200),
        row('The Matrix 1999 2160p UHD BluRay HDR', 150, '30 GB')
      ],
      ctx,
      { preferredResolution: '2160p' }
    )
    expect(ranked[0]!.release.resolution).toBe('2160p')
  })
})
