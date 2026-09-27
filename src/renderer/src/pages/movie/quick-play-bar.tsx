import type { ReactElement } from 'react'
import { Bookmark, BookmarkCheck, Loader2, Play } from 'lucide-react'
import type { RankedTorrentSource } from '@shared/release-ranking'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3">
      <Button type="button" size="lg" className="gap-2" disabled={busy} onClick={onPlay}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {resumeSeconds > 0 ? `Resume from ${formatClock(resumeSeconds)}` : 'Play'}
      </Button>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-muted-foreground truncate">{status ?? subtitle}</p>
        {quickPlay.phase === 'no-sources' && (
          <p className="mt-1">
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
          <p className="text-destructive mt-1">
            {quickPlay.message}{' '}
            <button type="button" className="underline" onClick={onDismiss}>
              Dismiss
            </button>
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        aria-pressed={inWatchlist}
        onClick={onToggleWatchlist}
      >
        {inWatchlist ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
        {inWatchlist ? 'In my list' : 'My list'}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onShowSources}>
        Other copies
      </Button>
    </div>
  )
}
