import type { TorrentSource } from '@shared/torrent'
import { isValidMagnetUri } from '@shared/torrent'
import { qualitySortScore, swarmRatioScore } from '@shared/source-sort'
import { ArrowDown, ArrowUp, ArrowUpDown, Magnet, Play } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { TorrentQualityBadge } from './torrent-quality-badge'

type SortColumn = 'quality' | 'size' | 'swarm'
type SortState = { column: SortColumn; dir: 'asc' | 'desc' }

function SortableHeader({
  label,
  column,
  sort,
  onSort,
  title,
  className
}: {
  label: string
  column: SortColumn
  sort: SortState | null
  onSort: (column: SortColumn) => void
  title?: string
  className?: string
}): ReactElement {
  const active = sort?.column === column
  const dir = active ? sort.dir : null
  return (
    <th
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      className={cn('p-2 font-medium', className)}
    >
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center gap-1 rounded-sm"
        title={title}
        onClick={() => onSort(column)}
      >
        {label}
        {dir === 'asc' ? (
          <ArrowUp aria-hidden className="size-3.5" />
        ) : dir === 'desc' ? (
          <ArrowDown aria-hidden className="size-3.5" />
        ) : (
          <ArrowUpDown aria-hidden className="size-3.5 opacity-40" />
        )}
      </button>
    </th>
  )
}

function CopyMagnetButton({
  uri,
  onCopy
}: {
  uri: string
  onCopy: (uri: string) => void
}): ReactElement {
  const [copied, setCopied] = useState(false)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(id)
  }, [copied])

  return (
    <Tooltip open={hover || copied} onOpenChange={setHover}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={copied ? 'Copied' : 'Copy magnet'}
          onClick={() => {
            onCopy(uri)
            setCopied(true)
          }}
        >
          <Magnet aria-hidden className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? 'Copied' : 'Copy magnet'}</TooltipContent>
    </Tooltip>
  )
}

export function MovieTorrentSourcesTable({
  rows,
  addBusyMagnet,
  onQueueDownload,
  onCopyMagnet
}: {
  rows: TorrentSource[]
  addBusyMagnet: string | null
  onQueueDownload: (row: TorrentSource) => void
  onCopyMagnet: (uri: string) => void
}): ReactElement {
  const [sort, setSort] = useState<SortState | null>(null)

  const onSort = (column: SortColumn): void => {
    setSort((prev) => {
      if (prev?.column !== column) return { column, dir: 'desc' }
      return { column, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
    })
  }

  const sortedRows = useMemo(() => {
    const indexed = rows.map((row, index) => ({ row, index }))
    if (!sort) return indexed
    const direction = sort.dir === 'asc' ? 1 : -1
    return indexed.sort((a, b) => {
      if (sort.column === 'size') {
        const left = a.row.sizeBytes
        const right = b.row.sizeBytes
        if (left == null && right == null) return a.index - b.index
        if (left == null) return 1
        if (right == null) return -1
        if (left !== right) return (left - right) * direction
        return a.index - b.index
      }
      const score =
        sort.column === 'quality'
          ? qualitySortScore
          : (row: TorrentSource) => swarmRatioScore(row.seeders, row.leechers)
      const delta = score(a.row) - score(b.row)
      if (delta !== 0) return delta * direction
      return a.index - b.index
    })
  }, [rows, sort])

  return (
    <TooltipProvider>
      <div
        role="region"
        aria-label="Torrent sources"
        tabIndex={0}
        className="bg-card/60 max-h-[min(55vh,28rem)] overflow-auto rounded-md border border-border [scrollbar-width:thin]"
      >
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/95 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80">
              <th className="w-full p-2 font-medium">Title</th>
              <SortableHeader label="Quality" column="quality" sort={sort} onSort={onSort} />
              <SortableHeader label="Size" column="size" sort={sort} onSort={onSort} />
              <SortableHeader
                label="Seeds"
                column="swarm"
                sort={sort}
                onSort={onSort}
                title="Seeders / leechers. A larger healthy swarm sorts first."
                className="whitespace-nowrap"
              />
              <th className="p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ row, index }) => (
              <tr key={`${row.title}-${index}`} className="border-b border-border last:border-0">
                <td className="p-2 ps-4 align-top">
                  <span className="line-clamp-2">{row.title}</span>
                </td>
                <td className="text-muted-foreground p-2 align-top whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span>
                      {[
                        row.release.resolution,
                        row.release.source,
                        row.quality?.hdr ?? (row.release.hdr ? 'HDR' : null)
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                    {row.quality ? <TorrentQualityBadge quality={row.quality} /> : null}
                  </div>
                </td>
                <td className="text-muted-foreground p-2 align-top whitespace-nowrap">
                  {row.size ?? '—'}
                </td>
                <td className="p-2 align-top whitespace-nowrap tabular-nums">
                  {row.seeders}
                  <span className="text-muted-foreground"> / {row.leechers}</span>
                </td>
                <td className="p-2 align-top whitespace-nowrap">
                  <div className="flex flex-nowrap items-center gap-1">
                    {row.magnetUri && isValidMagnetUri(row.magnetUri) ? (
                      <>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-8 gap-1"
                          disabled={addBusyMagnet !== null}
                          title="Play this copy. Playback starts once it has buffered."
                          onClick={() => onQueueDownload(row)}
                        >
                          <Play className="size-3.5" />
                          {addBusyMagnet === row.magnetUri ? 'Adding…' : 'Play'}
                        </Button>
                        <CopyMagnetButton uri={row.magnetUri} onCopy={onCopyMagnet} />
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}
