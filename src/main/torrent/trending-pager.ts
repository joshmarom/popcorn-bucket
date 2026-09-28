import type { CatalogMovieListItem } from '@shared/catalog'

export type TrendingPageSource = {
  name: string
  /** First page number to request from this source. */
  firstPage: number
  /** One page of rows; `done` means the source has nothing after this page. */
  load: (page: number) => Promise<{ items: CatalogMovieListItem[]; done: boolean }>
}

export type TrendingPageResult = {
  results: CatalogMovieListItem[]
  page: number
  hasMore: boolean
}

/** A source that adds nothing new this many pages in a row is treated as exhausted. */
const MAX_EMPTY_STREAK = 3

/**
 * An endless list: a fixed ranked head, then rows pulled from each source in turn as deeper
 * pages are requested. A source that throws or runs dry hands over to the next one.
 */
export class TrendingPager {
  private readonly items: CatalogMovieListItem[] = []
  private readonly seen = new Set<number>()
  private sourceIndex = 0
  private nextPage: number
  private emptyStreak = 0
  private filling: Promise<void> = Promise.resolve()

  constructor(
    head: CatalogMovieListItem[],
    private readonly sources: TrendingPageSource[],
    private readonly pageSize: number
  ) {
    this.add(head)
    this.nextPage = sources[0]?.firstPage ?? 1
  }

  private add(rows: CatalogMovieListItem[]): number {
    let added = 0
    for (const row of rows) {
      if (this.seen.has(row.id)) continue
      this.seen.add(row.id)
      this.items.push(row)
      added++
    }
    return added
  }

  private advanceSource(): void {
    this.sourceIndex++
    this.nextPage = this.sources[this.sourceIndex]?.firstPage ?? 1
    this.emptyStreak = 0
  }

  private async fill(target: number): Promise<void> {
    while (this.items.length < target && this.sourceIndex < this.sources.length) {
      const source = this.sources[this.sourceIndex]!
      let page: Awaited<ReturnType<TrendingPageSource['load']>>
      try {
        page = await source.load(this.nextPage)
      } catch (error) {
        console.warn(`Trending source ${source.name} failed; trying the next one`, error)
        this.advanceSource()
        continue
      }
      this.nextPage++
      const added = this.add(page.items)
      this.emptyStreak = added === 0 ? this.emptyStreak + 1 : 0
      if (page.done || this.emptyStreak >= MAX_EMPTY_STREAK) this.advanceSource()
    }
  }

  /** 1-based page. Concurrent calls are serialized so sources are read in order. */
  async page(page: number): Promise<TrendingPageResult> {
    const p = Math.max(1, Math.floor(page))
    const end = p * this.pageSize
    // One extra row tells whether a next page exists.
    const run = this.filling.then(() => this.fill(end + 1))
    this.filling = run.catch(() => {})
    await run
    return {
      results: this.items.slice(end - this.pageSize, end),
      page: p,
      hasMore: this.items.length > end
    }
  }
}
