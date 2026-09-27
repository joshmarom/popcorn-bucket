import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { RefreshCw } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MovieDownloadCard } from './movie-download-card'

export function MovieDownloadsSection({
  downloads,
  downloadsRefreshBusy,
  playError,
  playDialogOpen,
  playBusyDownloadId,
  pauseBusyDownloadId,
  onRefresh,
  onPlay,
  onPause,
  onResume,
  onDeleteClick
}: {
  downloads: MovieTorrentDownloadSnapshot[]
  downloadsRefreshBusy: boolean
  playError: string | null
  playDialogOpen: boolean
  playBusyDownloadId: string | null
  pauseBusyDownloadId: string | null
  onRefresh: () => void
  onPlay: (downloadId: string) => void
  onPause: (downloadId: string) => void
  onResume: (downloadId: string) => void
  onDeleteClick: (downloadId: string) => void
}): ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={downloadsRefreshBusy}
          onClick={onRefresh}
        >
          <RefreshCw className={cn('size-3.5', downloadsRefreshBusy && 'animate-spin')} />
          Refresh
        </Button>
      </div>
      {playError && !playDialogOpen && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {playError}
        </p>
      )}
      {downloads.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No downloads yet. Use Download on an indexer result below.
        </p>
      ) : (
        <div className="space-y-3">
          {downloads.map((d) => (
            <MovieDownloadCard
              key={d.downloadId}
              download={d}
              playBusyDownloadId={playBusyDownloadId}
              pauseBusyDownloadId={pauseBusyDownloadId}
              onPlay={onPlay}
              onPause={onPause}
              onResume={onResume}
              onDeleteClick={onDeleteClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
