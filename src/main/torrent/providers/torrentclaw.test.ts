import { describe, expect, it } from 'vitest'
import { withReleaseInfo } from '@shared/torrent'
import { tcSearchResultSchema, tcTorrentSchema } from '../../torrentclaw/schemas'
import { splitQuery, torrentClawRow } from './torrentclaw'

describe('splitQuery', () => {
  it('separates a trailing year and drops episode codes', () => {
    expect(splitQuery('Heat 1995')).toEqual({ text: 'Heat', year: 1995 })
    expect(splitQuery('Severance S02E05')).toEqual({ text: 'Severance', year: null })
    expect(splitQuery('Blade Runner 2049 2017')).toEqual({ text: 'Blade Runner 2049', year: 2017 })
  })
})

const result = tcSearchResultSchema.parse({
  id: 73156,
  contentType: 'show',
  title: 'Game of Thrones',
  contentUrl: '/shows/game-of-thrones-2011-73156'
})

describe('torrentClawRow', () => {
  it('maps scan data, links, and episode numbers', () => {
    const t = tcTorrentSchema.parse({
      infoHash: 'a'.repeat(40),
      rawTitle: 'Game.of.Thrones.S01.1080p.BluRay.x265',
      torrentUrl: `/api/v1/torrent/${'a'.repeat(40)}`,
      sizeBytes: 3082568603,
      seeders: 12,
      leechers: 3,
      qualityScore: 85,
      scanStatus: 'success',
      season: 1,
      episode: null,
      subtitleLanguages: ['en'],
      videoInfo: { hdr: '', codec: 'hevc', height: 1080 },
      hdrType: null
    })
    const row = torrentClawRow(t, result)!
    expect(row.magnetUri).toMatch(/^magnet:\?xt=urn:btih:a{40}/)
    expect(row.detailsUrl).toBe('https://torrentclaw.com/shows/game-of-thrones-2011-73156')
    expect(row.torrentFileUrl).toBe(`https://torrentclaw.com/api/v1/torrent/${'a'.repeat(40)}`)
    expect(row.size).toBe('2.9 GB')
    expect(row.quality).toMatchObject({ score: 85, verified: true, hdr: null, videoHeight: 1080 })
    expect(row.tvEpisode).toEqual({ season: 1, episode: null })
    expect(withReleaseInfo(row).release).toMatchObject({ season: 1, seasonPack: true })
  })

  it('drops rows without a magnet or info hash (anonymous responses)', () => {
    const t = tcTorrentSchema.parse({ rawTitle: 'Inception 2010 1080p', seeders: 5, leechers: 0 })
    expect(torrentClawRow(t, result)).toBeNull()
  })
})
