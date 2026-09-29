import { describe, expect, it } from 'vitest'
import { parseCurlHeaderDump, usesCurlForHost } from './curl-fetch'

describe('usesCurlForHost', () => {
  it('covers apibay, LimeTorrents, and UIndex', () => {
    expect(usesCurlForHost('apibay.org')).toBe(true)
    expect(usesCurlForHost('www.limetorrents.lol')).toBe(true)
    expect(usesCurlForHost('www.limetorrents.fun')).toBe(true)
    expect(usesCurlForHost('uindex.org')).toBe(true)
    expect(usesCurlForHost('yts.bz')).toBe(false)
    expect(usesCurlForHost('api.knaben.org')).toBe(false)
  })
})

describe('parseCurlHeaderDump', () => {
  it('uses the last redirect response', () => {
    const dump = [
      'HTTP/2 301',
      'location: https://www.limetorrents.fun/search/movies/inception/date/1/',
      '',
      'HTTP/2 200',
      'content-type: text/html; charset=UTF-8',
      'server: cloudflare',
      ''
    ].join('\r\n')
    const parsed = parseCurlHeaderDump(dump)
    expect(parsed.status).toBe(200)
    expect(parsed.headers.get('content-type')).toBe('text/html; charset=UTF-8')
  })
})
