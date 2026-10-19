import { useEffect, useState } from 'react'

export type ListResponse<T> = { ok: true; items: T[] } | { ok: false; error: string }

const RAIL_MAX = 20

const cache = new Map<string, unknown[]>()
const inflight = new Map<string, Promise<unknown[]>>()

function loadCached<T>(
  key: string,
  load: () => Promise<ListResponse<T>>,
  include: (item: T) => boolean
): Promise<T[]> {
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T[]>
  const request = load()
    .then((res) => {
      if (!res.ok) return []
      const items = res.items.filter(include).slice(0, RAIL_MAX)
      cache.set(key, items)
      return items
    })
    .catch(() => [])
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, request)
  return request
}

/** Loads one rail's list; any failure leaves it empty so the rail stays hidden. */
export function useDiscoverList<T>(
  load: () => Promise<ListResponse<T>>,
  key: string,
  include: (item: T) => boolean
): { items: T[]; loading: boolean } {
  const cached = cache.get(key) as T[] | undefined
  const [state, setState] = useState<{ key: string; items: T[] } | null>(
    cached ? { key, items: cached } : null
  )
  if (cached && (state == null || state.key !== key)) {
    setState({ key, items: cached })
  } else if (!cached && state != null && state.key !== key) {
    setState(null)
  }

  useEffect(() => {
    if (cache.has(key)) return
    let cancelled = false
    void loadCached(key, load, include).then((items) => {
      if (!cancelled) setState({ key, items })
    })
    return (): void => {
      cancelled = true
    }
    // `load` and `include` are recreated each render; `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const items = state?.key === key ? state.items : []
  return { items, loading: state?.key !== key }
}
