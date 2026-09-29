import { describe, expect, it } from 'vitest'
import {
  parseTmdbImageUrl,
  publicMediaUrl,
  rewriteMediaUrls,
  tmdbCdnUrl
} from './media-urls'

describe('parseTmdbImageUrl', () => {
  it('parses TMDB, TorrentClaw, and our own media URLs', () => {
    expect(parseTmdbImageUrl('https://image.tmdb.org/t/p/w500/abc.jpg', 'poster')).toEqual({
      kind: 'poster',
      size: 'w500',
      filePath: '/abc.jpg'
    })
    expect(
      parseTmdbImageUrl('https://img.torrentclaw.com/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg')
    ).toEqual({
      kind: 'backdrop',
      size: 'w1280',
      filePath: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg'
    })
    expect(
      parseTmdbImageUrl('https://popcorn.josh.co.il/media/tmdb/still/w1280/xyz.jpg')
    ).toEqual({
      kind: 'still',
      size: 'w1280',
      filePath: '/xyz.jpg'
    })
  })

  it('rejects odd paths', () => {
    expect(parseTmdbImageUrl('https://example.com/foo.jpg')).toBeNull()
    expect(parseTmdbImageUrl('https://image.tmdb.org/t/p/w500/../secret.jpg')).toBeNull()
  })
})

describe('rewriteMediaUrls', () => {
  it('rewrites nested poster and backdrop fields', () => {
    const origin = 'https://popcorn.josh.co.il'
    const rewritten = rewriteMediaUrls(
      {
        posterUrl: tmdbCdnUrl('w185', '/a.jpg'),
        movie: {
          backdropUrl: 'https://img.torrentclaw.com/t/p/w1280/b.jpg',
          backdropUrls: ['https://image.tmdb.org/t/p/w1280/c.jpg']
        }
      },
      origin
    )
    expect(rewritten.posterUrl).toBe(publicMediaUrl(origin, {
      kind: 'poster',
      size: 'w185',
      filePath: '/a.jpg'
    }))
    expect(rewritten.movie.backdropUrl).toContain('/media/tmdb/backdrop/w1280/b.jpg')
    expect(rewritten.movie.backdropUrls[0]).toContain('/media/tmdb/backdrop/w1280/c.jpg')
  })
})
