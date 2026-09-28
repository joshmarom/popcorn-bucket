import { useEffect, useState } from 'react'
import type { CatalogMovieListFacts, CatalogMovieListItem } from '@shared/catalog'

const CHUNK = 40

const waiters = new Map<number, Array<(fact: CatalogMovieListFacts | null) => void>>()
let flushScheduled = false

function needsFacts(item: CatalogMovieListItem): boolean {
  return item.runtime == null || item.genres.length === 0
}

async function loadFacts(ids: number[]): Promise<CatalogMovieListFacts[]> {
  const facts: CatalogMovieListFacts[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    try {
      const res = await window.api.catalog.listFacts(ids.slice(i, i + CHUNK))
      if (res.ok) facts.push(...res.facts)
    } catch {
      // This chunk stays blank; the cards keep the list payload.
    }
  }
  return facts
}

function deliver(id: number, fact: CatalogMovieListFacts | null): void {
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
    void (async (): Promise<void> => {
      try {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK)
          const loaded = await loadFacts(slice)
          const byId = new Map(loaded.map((fact) => [fact.id, fact]))
          for (const id of slice) deliver(id, byId.get(id) ?? null)
        }
      } catch {
        for (const id of ids) {
          if (waiters.has(id)) deliver(id, null)
        }
      }
    })()
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

/** Merges runtime and genres fetched for the cards on screen into the list rows. */
export function useMovieListFacts<T extends CatalogMovieListItem>(items: T[]): T[] {
  const [facts, setFacts] = useState<Map<number, CatalogMovieListFacts>>(() => new Map())

  const missingKey = [
    ...new Set(
      items.filter((item) => needsFacts(item) && !facts.has(item.id)).map((item) => item.id)
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

  return items.map((item) => {
    const fact = facts.get(item.id)
    if (!fact) return item
    return {
      ...item,
      runtime: item.runtime ?? fact.runtime,
      genres: item.genres.length > 0 ? item.genres : fact.genres,
      voteAverage: item.voteAverage ?? fact.voteAverage
    }
  })
}
