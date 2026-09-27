import { describe, expect, it } from 'vitest'
import { eztvQueryTarget, eztvRowMatches } from './eztv'

describe('EZTV query matching', () => {
  it('reads a season and episode out of an episode search', () => {
    expect(eztvQueryTarget('The Office S01E02')).toEqual({ season: 1, episode: 2 })
  })

  it('reads a season pack search', () => {
    expect(eztvQueryTarget('The Office S01')).toEqual({ season: 1, episode: null })
  })

  it('ignores movie titles', () => {
    expect(eztvQueryTarget('The Office 2005')).toBeNull()
  })

  it('keeps the episode and season packs, and drops other episodes', () => {
    const target = { season: 1, episode: 2 }
    expect(eztvRowMatches(target, 1, 2)).toBe(true)
    expect(eztvRowMatches(target, 1, 0)).toBe(true)
    expect(eztvRowMatches(target, 1, 3)).toBe(false)
    expect(eztvRowMatches(target, 2, 2)).toBe(false)
  })

  it('a season-only search keeps the whole season', () => {
    const target = { season: 3, episode: null }
    expect(eztvRowMatches(target, 3, 1)).toBe(true)
    expect(eztvRowMatches(target, 3, 0)).toBe(true)
    expect(eztvRowMatches(target, 4, 1)).toBe(false)
  })
})
