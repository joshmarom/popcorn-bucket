import { useEffect, useState } from 'react'

export type ListResponse<T> = { ok: true; items: T[] } | { ok: false; error: string }

const RAIL_MAX = 20

/** Loads one rail's list; any failure leaves it empty so the rail stays hidden. */
export function useDiscoverList<T>(
  load: () => Promise<ListResponse<T>>,
  key: string,
  include: (item: T) => boolean
): { items: T[]; loading: boolean } {
  const [state, setState] = useState<{ key: string; items: T[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    load()
      .then((res) => {
        if (cancelled) return
        const items = res.ok ? res.items.filter(include) : []
        setState({ key, items: items.slice(0, RAIL_MAX) })
      })
      .catch(() => {
        if (!cancelled) setState({ key, items: [] })
      })
    return (): void => {
      cancelled = true
    }
    // `load` and `include` are recreated each render; `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return {
    items: state?.key === key ? state.items : [],
    loading: state?.key !== key
  }
}
