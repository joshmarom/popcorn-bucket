import { describe, expect, it } from 'vitest'
import { seasonLabel, showStatus, yearSpan } from './tv-meta'

describe('yearSpan', () => {
  it('shows a finished run as a range', () => {
    expect(yearSpan(2019, 2024, 'Ended')).toBe('2019–2024')
    expect(yearSpan(2020, 2020, 'Canceled')).toBe('2020')
  })

  it('leaves the end open while a show is running', () => {
    expect(yearSpan(2022, 2026, 'Returning Series')).toBe('2022–')
  })

  it('falls back to the first year', () => {
    expect(yearSpan(2021, null, null)).toBe('2021')
    expect(yearSpan(null, 2024, 'Ended')).toBeNull()
  })
})

describe('showStatus', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')

  it('flags episodes that aired in the last 14 days', () => {
    expect(
      showStatus({ tmdbStatus: 'Returning Series', lastEpisodeAirDate: '2026-09-20' }, now)
    ).toBe('new')
    expect(showStatus({ tmdbStatus: 'Ended', lastEpisodeAirDate: '2026-09-15' }, now)).toBe('new')
  })

  it('stops calling it new after the window', () => {
    expect(
      showStatus({ tmdbStatus: 'Returning Series', lastEpisodeAirDate: '2026-09-10' }, now)
    ).toBe('returning')
    expect(showStatus({ tmdbStatus: 'Canceled', lastEpisodeAirDate: '2025-01-01' }, now)).toBe(
      'ended'
    )
  })

  it('ignores future air dates and unknown statuses', () => {
    expect(showStatus({ tmdbStatus: null, lastEpisodeAirDate: '2026-10-05' }, now)).toBeNull()
    expect(showStatus({ tmdbStatus: 'Planned', lastEpisodeAirDate: null }, now)).toBeNull()
  })
})

describe('seasonLabel', () => {
  it('pluralizes', () => {
    expect(seasonLabel(1)).toBe('1 season')
    expect(seasonLabel(4)).toBe('4 seasons')
    expect(seasonLabel(0)).toBeNull()
    expect(seasonLabel(null)).toBeNull()
  })
})
