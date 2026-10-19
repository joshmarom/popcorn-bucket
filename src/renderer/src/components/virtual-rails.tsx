import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useScrollContainer } from '@/lib/scroll-container'

/** A rail section: heading, a row of small posters, and the 48px gap below it. */
const RAIL_ESTIMATE = 352
const RAIL_GAP = 48

/**
 * Renders only the rails near the viewport. Rails mount as they scroll into range and unmount
 * once they are well out of it, so a page with twenty genre rows keeps a handful in the DOM.
 */
export function VirtualRails<T>({
  items,
  getKey,
  renderItem
}: {
  items: T[]
  getKey: (item: T) => string | number
  renderItem: (item: T) => ReactNode
}): ReactElement {
  const scrollElement = useScrollContainer()
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || !scrollElement) return
    const measure = (): void => {
      const top =
        list.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop
      setScrollMargin((prev) => (Math.abs(prev - top) < 1 ? prev : top))
    }
    measure()
    const page = scrollElement.firstElementChild
    const observer = new ResizeObserver(measure)
    if (page) observer.observe(page)
    return () => observer.disconnect()
  }, [scrollElement])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    // The virtualizer scrolls to this offset when it attaches. The list mounts once rails have
    // loaded, often after the reader has started scrolling, so start from where they already are.
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    estimateSize: () => RAIL_ESTIMATE + RAIL_GAP,
    overscan: 2,
    scrollMargin,
    getItemKey: (index) => getKey(items[index]!)
  })

  const rows = virtualizer.getVirtualItems()

  return (
    <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {rows.map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 left-0 w-full"
          style={{
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            paddingBottom: RAIL_GAP
          }}
        >
          {renderItem(items[row.index]!)}
        </div>
      ))}
    </div>
  )
}
