import { describe, expect, it } from 'vitest'
import type { CatalogMovieListItem } from '@shared/catalog'
import { TrendingPager, type TrendingPageSource } from './trending-pager'

function movie(id: number): CatalogMovieListItem {
  return {
    id,
    title: `Movie ${id}`,
    releaseDate: null,
    releaseYear: null,
    voteAverage: null,
    popularity: null,
    posterUrl: null,
    overview: '',
    genres: [],
    runtime: null
  }
}

const ids = (rows: CatalogMovieListItem[]): number[] => rows.map((r) => r.id)
const range = (from: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => from + i)

describe('TrendingPager', () => {
  it('serves the head first, then pages from the source, skipping duplicates', async () => {
    const calls: number[] = []
    const source: TrendingPageSource = {
      name: 'a',
      firstPage: 5,
      load: async (page) => {
        calls.push(page)
        // Page 5 repeats two head titles.
        const base = page === 5 ? [1, 2] : []
        return { items: [...base, ...range(page * 10, 3)].map(movie), done: false }
      }
    }
    const pager = new TrendingPager([1, 2, 3, 4].map(movie), [source], 3)
    const p1 = await pager.page(1)
    expect(ids(p1.results)).toEqual([1, 2, 3])
    expect(p1.hasMore).toBe(true)
    expect(calls).toEqual([])

    const p2 = await pager.page(2)
    expect(ids(p2.results)).toEqual([4, 50, 51])
    expect(calls).toEqual([5])

    const p3 = await pager.page(3)
    expect(ids(p3.results)).toEqual([52, 60, 61])
    expect(calls).toEqual([5, 6])
  })

  it('switches to the next source when one throws', async () => {
    const failing: TrendingPageSource = {
      name: 'tc',
      firstPage: 5,
      load: async () => {
        throw new Error('down')
      }
    }
    const backup: TrendingPageSource = {
      name: 'tmdb',
      firstPage: 1,
      load: async (page) => ({ items: range(page * 100, 2).map(movie), done: false })
    }
    const pager = new TrendingPager([movie(1)], [failing, backup], 2)
    expect(ids((await pager.page(2)).results)).toEqual([101, 200])
  })

  it('treats repeated empty pages as exhausted and reports the end', async () => {
    let loads = 0
    const stale: TrendingPageSource = {
      name: 'stale',
      firstPage: 1,
      load: async () => {
        loads++
        return { items: [movie(1)], done: false }
      }
    }
    const last: TrendingPageSource = {
      name: 'last',
      firstPage: 1,
      load: async (page) => ({ items: [movie(900 + page)], done: page >= 2 })
    }
    const pager = new TrendingPager([movie(1)], [stale, last], 2)
    const p1 = await pager.page(1)
    expect(ids(p1.results)).toEqual([1, 901])
    expect(p1.hasMore).toBe(true)
    const p2 = await pager.page(2)
    expect(ids(p2.results)).toEqual([902])
    expect(p2.hasMore).toBe(false)
    expect(loads).toBe(3)
  })

  it('serializes concurrent requests', async () => {
    const calls: number[] = []
    const source: TrendingPageSource = {
      name: 'a',
      firstPage: 1,
      load: async (page) => {
        calls.push(page)
        await new Promise((r) => setTimeout(r, 5))
        return { items: range(page * 10, 2).map(movie), done: false }
      }
    }
    const pager = new TrendingPager([], [source], 2)
    const [a, b] = await Promise.all([pager.page(1), pager.page(2)])
    expect(ids(a.results)).toEqual([10, 11])
    expect(ids(b.results)).toEqual([20, 21])
    expect(calls).toEqual([1, 2, 3])
  })
})
