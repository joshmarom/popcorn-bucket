import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { Pause, Play, Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatBytes, formatSpeed, statusLabel } from '@/lib/torrent-download-format'

export function MovieDownloadCard({
  download: d,
  playBusyDownloadId,
  pauseBusyDownloadId,
  onPlay,
  onPause,
  onResume,
  onDeleteClick
}: {
  download: MovieTorrentDownloadSnapshot
  playBusyDownloadId: string | null
  pauseBusyDownloadId: string | null
  onPlay: (downloadId: string) => void
  onPause: (downloadId: string) => void
  onResume: (downloadId: string) => void
  onDeleteClick: (downloadId: string) => void
}): ReactElement {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium">{d.displayTitle}</h3>
            <Badge
              variant={
                d.status === 'error'
                  ? 'destructive'
                  : d.status === 'paused'
                    ? 'outline'
                    : d.status === 'complete'
                      ? 'outline'
                      : 'secondary'
              }
            >
              {statusLabel(d.status)}
            </Badge>
          </div>
          {d.torrentName && d.torrentName !== d.displayTitle ? (
            <p className="text-muted-foreground mt-1 truncate text-xs">{d.torrentName}</p>
          ) : null}
          {d.errorMessage ? (
            <p className="text-destructive mt-2 text-xs leading-relaxed">{d.errorMessage}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1"
            disabled={!d.canPlay || playBusyDownloadId !== null}
            onClick={() => onPlay(d.downloadId)}
          >
            <Play className="size-3.5" />
            {playBusyDownloadId === d.downloadId ? 'Starting…' : 'Play'}
          </Button>
          {d.status === 'downloading' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={pauseBusyDownloadId !== null}
              title="Pause downloading (can resume later)"
              onClick={() => onPause(d.downloadId)}
            >
              <Pause className="size-3.5" />
              {pauseBusyDownloadId === d.downloadId ? '…' : 'Pause'}
            </Button>
          ) : null}
          {d.status === 'paused' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={pauseBusyDownloadId !== null}
              title="Resume downloading"
              onClick={() => onResume(d.downloadId)}
            >
              <Play className="size-3.5" />
              {pauseBusyDownloadId === d.downloadId ? '…' : 'Resume'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            title="Delete this download and its data"
            onClick={() => onDeleteClick(d.downloadId)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>
      <div className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className="font-medium text-foreground">Indexer</span>: S {d.indexerSeeders} · L{' '}
          {d.indexerLeechers}
        </div>
        <div>
          <span className="font-medium text-foreground">Swarm</span>: {d.numPeers} peers
        </div>
        <div>
          <span className="font-medium text-foreground">Speeds</span>: ↓{' '}
          {formatSpeed(d.downloadSpeed)} · ↑ {formatSpeed(d.uploadSpeed)}
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <span className="font-medium text-foreground">Progress</span>: {formatBytes(d.downloaded)}{' '}
          / {formatBytes(d.totalBytes)} ({Math.round((d.progress || 0) * 100)}%)
          {d.playFileLabel ? (
            <span className="ml-1">
              · playing <span className="text-foreground">{d.playFileLabel}</span>
            </span>
          ) : null}
        </div>
      </div>
      {d.totalBytes > 0 && (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, Math.round((d.progress || 0) * 100))}%`
            }}
          />
        </div>
      )}
      {d.files.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            Files ({d.files.length})
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-2">
            {d.files.map((f) => (
              <li key={f.path} className="font-mono break-all">
                <span className="text-foreground">{f.path}</span>{' '}
                <span className="text-muted-foreground">
                  {formatBytes(f.downloaded)} / {formatBytes(f.length)} (
                  {Math.round(f.progress * 100)}
                  %)
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
