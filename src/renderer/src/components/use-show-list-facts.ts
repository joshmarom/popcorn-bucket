import { useEffect, useMemo, useState } from 'react'
import type { TvShowListFacts, TvShowListItem } from '@shared/tv'

const CHUNK = 40

const cache = new Map<number, TvShowListFacts>()
const waiters = new Map<number, Array<(fact: TvShowListFacts | null) => void>>()
let flushScheduled = false

async function loadFacts(ids: number[]): Promise<TvShowListFacts[]> {
  const slices: number[][] = []
  for (let i = 0; i < ids.length; i += CHUNK) slices.push(ids.slice(i, i + CHUNK))
  const batches = await Promise.all(
    slices.map(async (slice) => {
      try {
        const res = await window.api.tv.listFacts(slice)
        return res.ok ? res.facts : []
      } catch {
        return []
      }
    })
  )
  return batches.flat()
}

export async function primeShowListFacts(ids: number[]): Promise<void> {
  const missing = ids.filter((id) => !cache.has(id))
  if (missing.length === 0) return
  for (const fact of await loadFacts(missing)) cache.set(fact.id, fact)
}

function deliver(id: number, fact: TvShowListFacts | null): void {
  if (fact) cache.set(id, fact)
  const pending = waiters.get(id) ?? []
  waiters.delete(id)
  for (const resolve of pending) resolve(fact)
}

/** Batches every card asking in the same tick into one IPC call. */
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
        for (const id of ids) deliver(id, null)
      }
    )
  })
}

function requestFacts(ids: number[]): Promise<TvShowListFacts[]> {
  const pending = [...new Set(ids)].map(
    (id) =>
      new Promise<TvShowListFacts | null>((resolve) => {
        const list = waiters.get(id) ?? []
        list.push(resolve)
        waiters.set(id, list)
      })
  )
  scheduleFlush()
  return Promise.all(pending).then((facts) =>
    facts.filter((fact): fact is TvShowListFacts => fact != null)
  )
}

export type ShowWithFacts<T extends TvShowListItem> = T & { facts: TvShowListFacts | null }

/**
 * Season count, status, and genres for the show cards on screen. Facts are kept for the session,
 * so paging back and forth does not ask again.
 */
export function useShowListFacts<T extends TvShowListItem>(items: T[]): ShowWithFacts<T>[] {
  const [facts, setFacts] = useState<Map<number, TvShowListFacts>>(() => new Map())

  const missingKey = [
    ...new Set(items.filter((i) => !facts.has(i.id) && !cache.has(i.id)).map((i) => i.id))
  ].join(',')

  useEffect(() => {
    if (!missingKey) return
    let cancelled = false
    void requestFacts(missingKey.split(',').map(Number)).then((loaded) => {
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
      const fact = facts.get(item.id) ?? cache.get(item.id) ?? null
      return {
        ...item,
        genres: item.genres.length > 0 ? item.genres : (fact?.genres ?? []),
        voteAverage: item.voteAverage ?? fact?.voteAverage ?? null,
        facts: fact
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
