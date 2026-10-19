import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { cn } from '@/lib/utils'

export function IconSwap({
  state,
  a,
  b
}: {
  state: 'a' | 'b'
  a: ReactNode
  b: ReactNode
}): ReactElement {
  return (
    <span className="t-icon-swap" data-state={state}>
      <span className="t-icon" data-icon="a">
        {a}
      </span>
      <span className="t-icon" data-icon="b">
        {b}
      </span>
    </span>
  )
}

export function LearnChevron(): ReactElement {
  return (
    <span className="t-learn-chevron" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          className="t-learn-arm t-learn-arm-top"
          d="M6 4L10 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          className="t-learn-arm t-learn-arm-bot"
          d="M10 8L6 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function PanelReveal({
  instant = false,
  className,
  children
}: {
  instant?: boolean
  className?: string
  children: ReactNode
}): ReactElement {
  const [open, setOpen] = useState(instant)
  useEffect(() => {
    if (instant || open) return
    const frame = window.requestAnimationFrame(() => setOpen(true))
    return () => window.cancelAnimationFrame(frame)
  }, [instant, open])
  return (
    <div className={cn('t-panel-slide', className)} data-open={open ? 'true' : 'false'}>
      {children}
    </div>
  )
}

export function SlidingTabs<T extends string>({
  label,
  tabs,
  value,
  onChange
}: {
  label: string
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}): ReactElement {
  const pillRef = useRef<HTMLSpanElement>(null)
  const tabsRef = useRef(new Map<string, HTMLButtonElement>())
  const first = useRef(true)

  const moveTo = (id: string, animate: boolean): void => {
    const pill = pillRef.current
    const tab = tabsRef.current.get(id)
    if (!pill || !tab) return
    if (!animate) {
      const prev = pill.style.transition
      pill.style.transition = 'none'
      pill.style.transform = `translateX(${tab.offsetLeft}px)`
      pill.style.width = `${tab.offsetWidth}px`
      void pill.offsetWidth
      pill.style.transition = prev
      return
    }
    pill.style.transform = `translateX(${tab.offsetLeft}px)`
    pill.style.width = `${tab.offsetWidth}px`
  }

  useLayoutEffect(() => {
    moveTo(value, !first.current)
    first.current = false
  }, [value])

  useEffect(() => {
    const onResize = (): void => moveTo(value, false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [value])

  return (
    <div className="t-tabs" role="tablist" aria-label={label}>
      <span className="t-tabs-pill" aria-hidden ref={pillRef} />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="t-tab font-[inherit] text-sm leading-none"
          role="tab"
          aria-selected={value === tab.id}
          ref={(node) => {
            if (node) tabsRef.current.set(tab.id, node)
            else tabsRef.current.delete(tab.id)
          }}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
