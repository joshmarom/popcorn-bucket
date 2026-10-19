import { useEffect, useMemo, useState } from 'react'
import type { CatalogMovieListFacts, CatalogMovieListItem } from '@shared/catalog'

const CHUNK = 40

const cache = new Map<number, CatalogMovieListFacts>()
const waiters = new Map<number, Array<(fact: CatalogMovieListFacts | null) => void>>()
let flushScheduled = false

function needsFacts(item: CatalogMovieListItem): boolean {
  return item.runtime == null || item.genres.length === 0
}

async function loadFacts(ids: number[]): Promise<CatalogMovieListFacts[]> {
  const slices: number[][] = []
  for (let i = 0; i < ids.length; i += CHUNK) slices.push(ids.slice(i, i + CHUNK))
  const batches = await Promise.all(
    slices.map(async (slice) => {
      try {
        const res = await window.api.catalog.listFacts(slice)
        return res.ok ? res.facts : []
      } catch {
        return []
      }
    })
  )
  return batches.flat()
}

export async function primeMovieListFacts(ids: number[]): Promise<void> {
  const missing = ids.filter((id) => !cache.has(id))
  if (missing.length === 0) return
  for (const fact of await loadFacts(missing)) cache.set(fact.id, fact)
}

function deliver(id: number, fact: CatalogMovieListFacts | null): void {
  if (fact) cache.set(id, fact)
  const pending = waiters.get(id) ?? []
  waiters.delete(id)
  for (const resolve of pending) resolve(fact)
}

function scheduleFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    const ids = [...waiters.keys()]
    if (ids.length === 0) return
    void loadFacts(ids).then(
      (loaded) => {
        const byId = new Map(loaded.map((fact) => [fact.id, fact]))
        for (const id of ids) deliver(id, byId.get(id) ?? null)
      },
      () => {
        for (const id of ids) {
          if (waiters.has(id)) deliver(id, null)
        }
      }
    )
  })
}

function requestFacts(ids: number[]): Promise<CatalogMovieListFacts[]> {
  const unique = [...new Set(ids)]
  const pending = unique.map(
    (id) =>
      new Promise<CatalogMovieListFacts | null>((resolve) => {
        const list = waiters.get(id) ?? []
        list.push(resolve)
        waiters.set(id, list)
      })
  )
  scheduleFlush()
  return Promise.all(pending).then((facts) =>
    facts.filter((fact): fact is CatalogMovieListFacts => fact != null)
  )
}

/**
 * Merges runtime and genres fetched for the cards on screen into the list rows. Facts are kept
 * for the session, so rails that remount while scrolling do not ask again.
 */
export function useMovieListFacts<T extends CatalogMovieListItem>(items: T[]): T[] {
  const [facts, setFacts] = useState<Map<number, CatalogMovieListFacts>>(() => new Map())

  const missingKey = [
    ...new Set(
      items
        .filter((item) => needsFacts(item) && !facts.has(item.id) && !cache.has(item.id))
        .map((item) => item.id)
    )
  ].join(',')

  useEffect(() => {
    if (!missingKey) return
    const ids = missingKey.split(',').map((id) => Number(id))
    let cancelled = false
    void requestFacts(ids).then((loaded) => {
      if (cancelled || loaded.length === 0) return
      setFacts((prev) => {
        const next = new Map(prev)
        for (const fact of loaded) next.set(fact.id, fact)
        return next
      })
    })
    return (): void => {
      cancelled = true
    }
  }, [missingKey])

  const signature = `${items.map((item) => stableValue(item)).join('\n')}\n${stableValue(
    items.map((item) => facts.get(item.id) ?? cache.get(item.id) ?? null)
  )}`
  const rows = useMemo(() => {
    return items.map((item) => {
      const fact = facts.get(item.id) ?? cache.get(item.id)
      if (!fact) return item
      return {
        ...item,
        runtime: item.runtime ?? fact.runtime,
        genres: item.genres.length > 0 ? item.genres : fact.genres,
        voteAverage: item.voteAverage ?? fact.voteAverage
      }
    })
    // signature covers the list payload and loaded facts, so unchanged renders reuse these rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  return rows
}

function stableValue(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${key}:${stableValue(record[key])}`)
    .join(',')}}`
}
