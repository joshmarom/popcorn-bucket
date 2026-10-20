import type { ReactElement } from 'react'
import { Bookmark, BookmarkCheck, Loader2, Play } from 'lucide-react'
import type { RankedTorrentSource } from '@shared/release-ranking'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { IconSwap } from '@/components/interaction-motion'
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

  const failed = quickPlay.phase === 'error' || quickPlay.phase === 'no-sources'

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" className="w-full gap-2" disabled={busy} onClick={onPlay}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {resumeSeconds > 0 ? `Resume from ${formatClock(resumeSeconds)}` : 'Play'}
      </Button>
      <p
        className={failed ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
        aria-live="polite"
      >
        {metadata}
      </p>
      {(quickPlay.phase === 'no-sources' || quickPlay.phase === 'error') && (
        <div className="text-sm">
          {quickPlay.phase === 'no-sources' && (
            <p>
              <button type="button" className="text-primary underline" onClick={onShowSources}>
                See all sources
              </button>
              .
            </p>
          )}
          {quickPlay.phase === 'error' && (
            <button type="button" className="text-destructive underline" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full gap-1.5"
        aria-pressed={inWatchlist}
        onClick={onToggleWatchlist}
      >
        <IconSwap
          state={inWatchlist ? 'b' : 'a'}
          a={<Bookmark className="size-4" />}
          b={<BookmarkCheck className="size-4" />}
        />
        {inWatchlist ? 'In my list' : 'My list'}
      </Button>
    </div>
  )
}
