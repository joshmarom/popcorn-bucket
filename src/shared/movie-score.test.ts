import { describe, expect, it } from 'vitest'
import { movieScore, ratingScore, swarmScore, type MovieScoreInput } from './movie-score'

const NOW = Date.parse('2026-09-28T00:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

function movie(overrides: Partial<MovieScoreInput>): MovieScoreInput {
  return {
    seeders: null,
    seenAt: null,
    popularity: 50,
    voteAverage: 7,
    voteCount: 2000,
    releaseDate: '2024-05-01',
    ...overrides
  }
}

describe('movieScore', () => {
  it('ranks a strong swarm with a decent rating above a more popular TMDB-only title', () => {
    const seeded = movie({ seeders: 1500, seenAt: NOW - DAY_MS, popularity: 40 })
    const tmdbOnly = movie({ popularity: 400, voteAverage: 7.5 })
    expect(movieScore(seeded, NOW)).toBeGreaterThan(movieScore(tmdbOnly, NOW))
  })

  it('does not let a few perfect votes beat an established film', () => {
    expect(ratingScore(9.4, 12)).toBeLessThan(ratingScore(8.1, 25_000))
    const niche = movie({ voteAverage: 9.4, voteCount: 12 })
    const established = movie({ voteAverage: 8.1, voteCount: 25_000 })
    expect(movieScore(niche, NOW)).toBeLessThan(movieScore(established, NOW))
  })

  it('decays stale swarm evidence', () => {
    const fresh = swarmScore(800, NOW - DAY_MS, NOW)
    const week = swarmScore(800, NOW - 8 * DAY_MS, NOW)
    const month = swarmScore(800, NOW - 30 * DAY_MS, NOW)
    expect(week).toBeLessThan(fresh)
    expect(month).toBeLessThan(week)
    expect(week / fresh).toBeCloseTo(0.5, 1)
  })

  it('keeps movies with no torrent evidence but ranks them lower', () => {
    const base = { popularity: 120, voteAverage: 7.4, voteCount: 5000 }
    const withCopy = movie({ ...base, seeders: 5, seenAt: NOW - DAY_MS })
    const noCopy = movie(base)
    expect(movieScore(noCopy, NOW)).toBeGreaterThan(0)
    expect(movieScore(noCopy, NOW)).toBeLessThan(movieScore(withCopy, NOW))
  })

  it('scores unreleased titles lower than released ones', () => {
    const released = movie({ releaseDate: '2026-06-01' })
    const upcoming = movie({ releaseDate: '2027-02-01' })
    expect(movieScore(upcoming, NOW)).toBeLessThan(movieScore(released, NOW))
  })
})
