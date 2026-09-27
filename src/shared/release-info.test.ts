import { describe, expect, it } from 'vitest'
import { parseReleaseTitle, parseSizeBytes } from './release-info'

describe('parseReleaseTitle', () => {
  it('reads scene-style names', () => {
    expect(
      parseReleaseTitle('Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX')
    ).toEqual({
      resolution: '2160p',
      source: 'web',
      codec: 'x265',
      hdr: true,
      year: 2024,
      season: null,
      episode: null,
      seasonPack: false
    })
  })

  it('reads the YTS bracket format', () => {
    const r = parseReleaseTitle('Inception (2010) [1080p] [bluray] [x264]')
    expect(r.resolution).toBe('1080p')
    expect(r.source).toBe('bluray')
    expect(r.codec).toBe('x264')
    expect(r.year).toBe(2010)
  })

  it('flags cinema recordings', () => {
    expect(parseReleaseTitle('Some Movie 2025 HDCAM x264').source).toBe('cam')
    expect(parseReleaseTitle('Some.Movie.2025.HDTS.720p').source).toBe('telesync')
    expect(parseReleaseTitle('Some Movie 2025 DVDSCR').source).toBe('screener')
  })

  it('prefers remux over bluray', () => {
    expect(parseReleaseTitle('Heat 1995 1080p BluRay REMUX AVC').source).toBe('remux')
  })

  it('uses the last plausible year, so numeric titles do not win', () => {
    expect(parseReleaseTitle('2001 A Space Odyssey 1968 1080p BluRay').year).toBe(1968)
  })

  it('returns nulls for names with no markers', () => {
    expect(parseReleaseTitle('Just A Title')).toEqual({
      resolution: null,
      source: null,
      codec: null,
      hdr: false,
      year: null,
      season: null,
      episode: null,
      seasonPack: false
    })
  })
})

describe('episode markers', () => {
  it('reads SxxEyy and NxNN', () => {
    expect(parseReleaseTitle('Severance.S02E05.1080p.WEB.h264')).toMatchObject({
      season: 2,
      episode: 5,
      seasonPack: false
    })
    expect(parseReleaseTitle('The Office 3x14 720p')).toMatchObject({ season: 3, episode: 14 })
  })

  it('reads season packs', () => {
    expect(parseReleaseTitle('Severance S02 1080p WEB-DL')).toMatchObject({
      season: 2,
      episode: null,
      seasonPack: true
    })
    expect(parseReleaseTitle('Severance Season 1 Complete 720p')).toMatchObject({
      season: 1,
      seasonPack: true
    })
  })
})

describe('parseSizeBytes', () => {
  it('parses binary and decimal-looking units as 1024-based', () => {
    expect(parseSizeBytes('1 GB')).toBe(1024 ** 3)
    expect(parseSizeBytes('1.5 GiB')).toBe(Math.round(1.5 * 1024 ** 3))
    expect(parseSizeBytes('700 MB')).toBe(700 * 1024 ** 2)
    expect(parseSizeBytes('1,024.5 MB')).toBe(Math.round(1024.5 * 1024 ** 2))
  })

  it('returns null for missing or unreadable sizes', () => {
    expect(parseSizeBytes(null)).toBeNull()
    expect(parseSizeBytes('—')).toBeNull()
    expect(parseSizeBytes('big')).toBeNull()
  })
})
