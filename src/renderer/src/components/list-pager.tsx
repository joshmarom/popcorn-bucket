import type { ReactElement } from 'react'
import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'
import { CATALOG_LIST_PAGE_SIZE } from '@/lib/catalog-list-page-size'

type PageSlot = number | 'gap'

/** Pages kept on each side of the current page before the ellipsis. */
const PAGE_NEIGHBORS = 3

/**
 * First page, the current page and a few pages on either side, and the last page when known.
 * Open-ended lists end in a gap while another page exists.
 */
function pageSlots(page: number, hasNext: boolean, totalPages: number | null): PageSlot[] {
  // Open-ended lists only report whether one more page exists, so the window ahead is shown
  // up to the same number of neighbours kept behind the current page.
  const last = totalPages ?? (hasNext ? page + PAGE_NEIGHBORS : page)
  const pages = new Set<number>([1, page])
  for (let offset = 1; offset <= PAGE_NEIGHBORS; offset++) {
    pages.add(page - offset)
    pages.add(page + offset)
  }
  if (totalPages != null) pages.add(totalPages)
  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b)
  const slots: PageSlot[] = []
  for (const p of sorted) {
    const prev = slots[slots.length - 1]
    if (typeof prev === 'number' && p - prev === 2) slots.push(prev + 1)
    else if (typeof prev === 'number' && p - prev > 2) slots.push('gap')
    slots.push(p)
  }
  if (totalPages == null && hasNext) slots.push('gap')
  return slots
}

/**
 * Numbered pages under a paged poster grid. `totalPages` is null for open-ended lists that only
 * know whether another page exists; `total` is the item count when known.
 */
export function ListPager({
  page,
  itemCount,
  hasNext,
  totalPages = null,
  total = null,
  disabled = false,
  onPageChange
}: {
  page: number
  itemCount: number
  hasNext: boolean
  totalPages?: number | null
  total?: number | null
  disabled?: boolean
  onPageChange: (page: number) => void
}): ReactElement | null {
  const hasPrev = page > 1
  if (!hasPrev && !hasNext) return null
  const rangeStart = itemCount === 0 ? 0 : (page - 1) * CATALOG_LIST_PAGE_SIZE + 1
  const rangeEnd = rangeStart === 0 ? 0 : rangeStart + itemCount - 1
  return (
    <div className="flex flex-col items-center gap-2 pt-8">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              disabled={!hasPrev || disabled}
              onClick={() => onPageChange(page - 1)}
            />
          </PaginationItem>
          {pageSlots(page, hasNext, totalPages).map((slot, i) => (
            <PaginationItem key={slot === 'gap' ? `gap-${i}` : slot}>
              {slot === 'gap' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationButton
                  isActive={slot === page}
                  disabled={disabled && slot !== page}
                  aria-label={`Page ${slot}`}
                  onClick={() => {
                    if (slot !== page) onPageChange(slot)
                  }}
                >
                  {slot}
                </PaginationButton>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              disabled={!hasNext || disabled}
              onClick={() => onPageChange(page + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <p className="text-muted-foreground text-xs tabular-nums">
        Showing {rangeStart}–{rangeEnd}
        {total != null ? ` of ${total}` : ''}
      </p>
    </div>
  )
}
