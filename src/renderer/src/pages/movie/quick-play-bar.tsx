import type { ReactElement } from 'react'
import { Bookmark, BookmarkCheck, Loader2, Play } from 'lucide-react'
import type { RankedTorrentSource } from '@shared/release-ranking'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { releaseSummary } from '@/lib/release-summary'
import type { QuickPlayState } from './movie-page-store'

function formatClock(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

export function QuickPlayBar({
  quickPlay,
  best,
  existingDownload,
  bufferingDownload,
  playBusy,
  resumeSeconds,
  inWatchlist,
  onToggleWatchlist,
  onPlay,
  onShowSources,
  onUseVidking,
  onDismiss
}: {
  /** Saved position; > 0 turns the button into "Resume". */
  resumeSeconds: number
  inWatchlist: boolean
  onToggleWatchlist: () => void
  quickPlay: QuickPlayState
  /** Best-ranked copy from the last source search, when one has run. */
  best: RankedTorrentSource | null
  existingDownload: MovieTorrentDownloadSnapshot | null
  bufferingDownload: MovieTorrentDownloadSnapshot | null
  playBusy: boolean
  onPlay: () => void
  onShowSources: () => void
  onUseVidking: () => void
  onDismiss: () => void
}): ReactElement {
  const busy =
    playBusy ||
    quickPlay.phase === 'searching' ||
    quickPlay.phase === 'awaiting-notice' ||
    quickPlay.phase === 'buffering'

  let status: string | null = null
  if (quickPlay.phase === 'searching') status = 'Finding the best copy…'
  if (quickPlay.phase === 'buffering') {
    const d = bufferingDownload
    if (!d || d.status === 'pending_metadata') status = 'Connecting to peers…'
    else
      status = `Buffering ${Math.round(d.progress * 100)}% · ${d.numPeers} peer${d.numPeers === 1 ? '' : 's'}`
  }

  const subtitle = existingDownload
    ? existingDownload.status === 'complete'
      ? 'Downloaded · plays from disk'
      : 'Resume your download'
    : best
      ? releaseSummary(best)
      : 'Picks the best available copy'
  const metadata =
    quickPlay.phase === 'no-sources'
      ? 'No good copy found'
      : quickPlay.phase === 'error'
        ? quickPlay.message
        : (status ?? subtitle)

  return (
    <div className="flex flex-col gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block w-full">
              <Button
                type="button"
                size="lg"
                className="w-full gap-2"
                disabled={busy}
                onClick={onPlay}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {resumeSeconds > 0 ? `Resume from ${formatClock(resumeSeconds)}` : 'Play'}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{metadata}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full gap-1.5"
        aria-pressed={inWatchlist}
        onClick={onToggleWatchlist}
      >
        {inWatchlist ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
        {inWatchlist ? 'In my list' : 'My list'}
      </Button>
      {(quickPlay.phase === 'no-sources' || quickPlay.phase === 'error') && (
        <div className="text-sm">
          {quickPlay.phase === 'no-sources' && (
            <p>
              No good copy found.{' '}
              <button type="button" className="text-primary underline" onClick={onUseVidking}>
                Try VidKing
              </button>{' '}
              or{' '}
              <button type="button" className="text-primary underline" onClick={onShowSources}>
                see all sources
              </button>
              .
            </p>
          )}
          {quickPlay.phase === 'error' && (
            <p className="text-destructive">
              {quickPlay.message}{' '}
              <button type="button" className="underline" onClick={onDismiss}>
                Dismiss
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
