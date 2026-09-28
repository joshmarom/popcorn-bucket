import { describe, expect, it } from 'vitest'
import { pickBackdropPaths, type BackdropCandidate } from './movie-backdrops'

function still(filePath: string, overrides: Partial<BackdropCandidate> = {}): BackdropCandidate {
  return {
    filePath,
    iso639: null,
    voteAverage: 5,
    voteCount: 1,
    aspectRatio: 1.78,
    width: 1920,
    ...overrides
  }
}

describe('pickBackdropPaths', () => {
  it('leads with the primary backdrop and prefers language-neutral stills', () => {
    expect(
      pickBackdropPaths('/primary.jpg', [
        still('/text.jpg', { iso639: 'en', voteCount: 50 }),
        still('/wide.jpg', { voteCount: 3 }),
        still('/popular.jpg', { voteCount: 20 }),
        still('/primary.jpg', { voteCount: 1 })
      ])
    ).toEqual(['/primary.jpg', '/popular.jpg', '/wide.jpg'])
  })

  it('falls back to localized stills when only one neutral image exists', () => {
    expect(
      pickBackdropPaths('/primary.jpg', [
        still('/primary.jpg'),
        still('/en.jpg', { iso639: 'en', voteCount: 4 }),
        still('/fr.jpg', { iso639: 'fr', voteCount: 9 })
      ])
    ).toEqual(['/primary.jpg', '/fr.jpg', '/en.jpg'])
  })

  it('skips portrait and tiny images', () => {
    expect(
      pickBackdropPaths(null, [
        still('/posterish.jpg', { aspectRatio: 0.67, voteCount: 100 }),
        still('/tiny.jpg', { width: 300, voteCount: 80 }),
        still('/ok.jpg', { voteCount: 2 })
      ])
    ).toEqual(['/ok.jpg'])
  })

  it('keeps at most five stills', () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      still(`/s${i}.jpg`, { voteCount: 8 - i })
    )
    expect(pickBackdropPaths('/s0.jpg', candidates)).toHaveLength(5)
  })

  it('returns nothing when no still is usable', () => {
    expect(pickBackdropPaths(null, [])).toEqual([])
    expect(pickBackdropPaths('  ', [still('/tiny.jpg', { width: 100 })])).toEqual([])
  })
})
