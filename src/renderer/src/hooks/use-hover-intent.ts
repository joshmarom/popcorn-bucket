import { useCallback, useEffect, useRef, useState } from 'react'

const OPEN_DELAY_MS = 420
const CLOSE_DELAY_MS = 120

/**
 * Delayed open / delayed close for hover-driven overlays (popover labels, etc.).
 */
export function useHoverIntent(): {
  open: boolean
  setOpen: (open: boolean) => void
  onTriggerEnter: () => void
  onTriggerLeave: () => void
  onContentEnter: () => void
  onContentLeave: () => void
  /** Skip hover delay (keyboard / assistive tech). */
  onTriggerFocus: () => void
  onTriggerBlur: () => void
} {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearOpenTimer = useCallback(() => {
    if (openTimer.current != null) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearOpenTimer()
      clearCloseTimer()
    }
  }, [clearOpenTimer, clearCloseTimer])

  const onTriggerEnter = useCallback(() => {
    clearCloseTimer()
    clearOpenTimer()
    openTimer.current = setTimeout(() => {
      openTimer.current = null
      setOpen(true)
    }, OPEN_DELAY_MS)
  }, [clearCloseTimer, clearOpenTimer])

  const onTriggerLeave = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }, [clearOpenTimer, clearCloseTimer])

  const onContentEnter = useCallback(() => {
    clearCloseTimer()
  }, [clearCloseTimer])

  const onContentLeave = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }, [clearOpenTimer, clearCloseTimer])

  const onTriggerFocus = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    setOpen(true)
  }, [clearOpenTimer, clearCloseTimer])

  const onTriggerBlur = useCallback(() => {
    clearOpenTimer()
    clearCloseTimer()
    setOpen(false)
  }, [clearOpenTimer, clearCloseTimer])

  return {
    open,
    setOpen,
    onTriggerEnter,
    onTriggerLeave,
    onContentEnter,
    onContentLeave,
    onTriggerFocus,
    onTriggerBlur
  }
}
