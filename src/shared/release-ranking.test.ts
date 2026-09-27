import { describe, expect, it } from 'vitest'
import { matchesMovie, rankEpisodeSources, rankTorrentSources } from './release-ranking'
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

  it('rejects sequels and packs even when the year is mislabeled', () => {
    expect(matchesMovie(row('The Matrix Reloaded (1999) 1080p BrRip x264 - YIFY', 10), ctx)).toBe(
      false
    )
    expect(matchesMovie(row('The Matrix 1-4 Pack 1999-2021 1080p BluRay', 10), ctx)).toBe(false)
  })

  it('accepts site prefixes and bracket formats', () => {
    expect(matchesMovie(row('[YTS] The Matrix (1999) [2160p] [4K] [BluRay]', 10), ctx)).toBe(true)
    expect(
      matchesMovie(row('2001 A Space Odyssey 1968 1080p', 10), {
        movieTitle: '2001: A Space Odyssey',
        movieYear: 1968
      })
    ).toBe(true)
  })

  it('accepts rows without a year', () => {
    expect(matchesMovie(row('The Matrix 1080p WEB', 10), ctx)).toBe(true)
  })
})

describe('rankEpisodeSources', () => {
  const ep = { showName: 'Severance', season: 2, episode: 5 }

  it('keeps the exact episode and season packs, prefers the exact episode', () => {
    const { ranked, excluded } = rankEpisodeSources(
      [
        row('Severance S02 1080p WEB-DL', 300, '40 GB'),
        row('Severance.S02E05.1080p.WEB.h264', 200, '3 GB'),
        row('Severance.S02E04.1080p.WEB.h264', 900, '3 GB'),
        row('Severance S01 1080p WEB-DL', 900, '30 GB')
      ],
      ep
    )
    expect(ranked.map((r) => r.title)).toEqual([
      'Severance.S02E05.1080p.WEB.h264',
      'Severance S02 1080p WEB-DL'
    ])
    expect(excluded).toHaveLength(2)
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
