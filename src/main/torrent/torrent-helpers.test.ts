import { describe, expect, it } from 'vitest'
import { magnetFromInfoHash } from './magnet-from-hash'
import { dedupeTorrentSources } from './orchestrator'
import { resolveTorrentSearchInput } from './torrent-search-resolve'
import type { RawTorrentSource } from '@shared/torrent'

describe('magnetFromInfoHash', () => {
  it('normalizes the hash and attaches trackers', () => {
    const m = magnetFromInfoHash('Movie 2020', 'ABCDEF0123456789ABCDEF0123456789ABCDEF01')!
    expect(
      m.startsWith('magnet:?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01&dn=Movie%202020')
    ).toBe(true)
    expect(m).toContain('&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce')
  })

  it('rejects hashes that are not 40 hex characters', () => {
    expect(magnetFromInfoHash('x', 'abc')).toBeNull()
  })
})

describe('dedupeTorrentSources', () => {
  const base: RawTorrentSource = {
    title: 't',
    providerName: 'A',
    size: '1 GB',
    seeders: 1,
    leechers: 0,
    magnetUri: null,
    torrentFileUrl: null,
    detailsUrl: null,
    uploadDate: null
  }

  it('keeps the best-seeded copy of each info-hash', () => {
    const hash = 'b'.repeat(40)
    const rows = [
      { ...base, providerName: 'A', seeders: 5, magnetUri: `magnet:?xt=urn:btih:${hash}` },
      {
        ...base,
        providerName: 'B',
        seeders: 50,
        magnetUri: `magnet:?xt=urn:btih:${hash.toUpperCase()}&tr=x`
      },
      { ...base, providerName: 'C', seeders: 1, magnetUri: `magnet:?xt=urn:btih:${'c'.repeat(40)}` }
    ]
    const out = dedupeTorrentSources(rows)
    expect(out).toHaveLength(2)
    expect(out.find((r) => r.magnetUri?.toLowerCase().includes('bbbb'))?.providerName).toBe('B')
  })
})

describe('resolveTorrentSearchInput', () => {
  it('builds the query and cache key from title, year, and IMDb id', () => {
    const r = resolveTorrentSearchInput({
      title: 'Heat',
      releaseDate: '1995-12-15',
      imdbId: 'tt0113277'
    })
    expect(r).toEqual({
      valid: true,
      query: 'Heat 1995',
      imdbId: 'tt0113277',
      cacheKey: 'tt0113277::heat 1995'
    })
  })

  it('rejects empty input', () => {
    expect(resolveTorrentSearchInput({ title: ' ', releaseDate: null, imdbId: null }).valid).toBe(
      false
    )
  })
})
