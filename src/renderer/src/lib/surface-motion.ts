import { useEffect, useRef, useState, type Ref } from 'react'

export type SurfaceKind = 'modal' | 'dropdown' | 'tooltip'

const CLOSE_VAR: Record<SurfaceKind, string> = {
  modal: '--modal-close-dur',
  dropdown: '--dropdown-close-dur',
  tooltip: '--tt-out-dur'
}

function closeMs(kind: SurfaceKind): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(CLOSE_VAR[kind])
  const ms = parseFloat(raw)
  return Number.isFinite(ms) ? ms : 150
}

function originForSide(side: string | null): string {
  if (side === 'top') return 'bottom-center'
  if (side === 'left') return 'top-right'
  if (side === 'right') return 'top-left'
  return 'top-center'
}

export function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === 'function') ref(node)
  else if (ref) ref.current = node
}

/**
 * Toggle .is-open / .is-closing on a visual surface while a Radix layer
 * host stays mounted. Open waits one frame so the rest state can paint.
 * Close reads the duration from the CSS variable and clears .is-closing.
 */
export function useSurfaceMotion(kind: SurfaceKind): {
  setHost: (node: HTMLElement | null) => void
  setSurface: (node: HTMLElement | null) => void
} {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [surface, setSurface] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!host || !surface) return
    let timer = 0
    let frame = 0

    const sync = (): void => {
      const state = host.getAttribute('data-state')
      const open = state != null && state !== 'closed'
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
      if (kind === 'dropdown') surface.dataset.origin = originForSide(host.getAttribute('data-side'))
      if (open) {
        surface.classList.remove('is-closing')
        frame = window.requestAnimationFrame(() => surface.classList.add('is-open'))
        return
      }
      surface.classList.remove('is-open')
      surface.classList.add('is-closing')
      timer = window.setTimeout(() => surface.classList.remove('is-closing'), closeMs(kind))
    }

    sync()
    const obs = new MutationObserver(sync)
    obs.observe(host, { attributes: true, attributeFilter: ['data-state', 'data-side'] })
    return () => {
      obs.disconnect()
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [host, surface, kind])

  return { setHost, setSurface }
}

/** Keep a menu mounted through its close transition. */
export function useToggleMotion(open: boolean, kind: SurfaceKind = 'dropdown'): {
  present: boolean
  phase: 'rest' | 'open' | 'closing'
} {
  const [present, setPresent] = useState(open)
  const [phase, setPhase] = useState<'rest' | 'open' | 'closing'>('rest')
  const live = useRef(false)

  useEffect(() => {
    if (open) {
      live.current = true
      setPresent(true)
      setPhase('rest')
      const frame = window.requestAnimationFrame(() => setPhase('open'))
      return () => window.cancelAnimationFrame(frame)
    }
    if (!live.current) return
    setPhase('closing')
    const timer = window.setTimeout(() => {
      live.current = false
      setPresent(false)
      setPhase('rest')
    }, closeMs(kind))
    return () => window.clearTimeout(timer)
  }, [open, kind])

  return { present, phase }
}
