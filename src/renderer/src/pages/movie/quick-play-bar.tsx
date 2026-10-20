import type { ReactElement } from 'react'
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  HardDrive,
  ListVideo,
  Loader2,
  Play,
  Radio,
  Search,
  SearchX,
  TriangleAlert,
  X,
  type LucideIcon
} from 'lucide-react'
import type { RankedTorrentSource } from '@shared/release-ranking'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { IconSwap } from '@/components/interaction-motion'
import { Button } from '@/components/ui/button'
import { releaseParts } from '@/lib/release-summary'
import { cn } from '@/lib/utils'
import type { QuickPlayState } from './movie-page-store'

function formatClock(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** What the source strip under the Play button says about the copy that will play. */
type SourceReadout = {
  icon: LucideIcon
  /** Small, muted category (what kind of information this is). */
  label: string
  /** The value that matters most right now. */
  headline: string
  /** Supporting facts, lowest in the hierarchy. */
  detail?: string
  danger?: boolean
  /** 0..1 while buffering, drawn as a progress edge on the strip. */
  progress?: number
}

function sourceReadout({
  quickPlay,
  best,
  existingDownload,
  bufferingDownload
}: {
  quickPlay: QuickPlayState
  best: RankedTorrentSource | null
  existingDownload: MovieTorrentDownloadSnapshot | null
  bufferingDownload: MovieTorrentDownloadSnapshot | null
}): SourceReadout {
  if (quickPlay.phase === 'error') {
    return {
      icon: TriangleAlert,
      label: 'Playback failed',
      headline: quickPlay.message,
      danger: true
    }
  }
  if (quickPlay.phase === 'no-sources') {
    return {
      icon: SearchX,
      label: 'No good copy found',
      headline: 'Browse all sources',
      danger: true
    }
  }
  if (quickPlay.phase === 'searching') {
    return { icon: Search, label: 'Searching', headline: 'Finding the best copy…' }
  }
  if (quickPlay.phase === 'buffering') {
    const d = bufferingDownload
    if (!d || d.status === 'pending_metadata') {
      return { icon: Radio, label: 'Starting', headline: 'Connecting to peers…' }
    }
    return {
      icon: Radio,
      label: 'Buffering',
      headline: `${Math.round(d.progress * 100)}% buffered`,
      detail: `${d.numPeers} peer${d.numPeers === 1 ? '' : 's'}`,
      progress: d.progress
    }
  }
  if (existingDownload) {
    return existingDownload.status === 'complete'
      ? { icon: HardDrive, label: 'On this computer', headline: 'Plays from disk' }
      : { icon: HardDrive, label: 'Partly downloaded', headline: 'Resume your download' }
  }
  if (best) {
    const { quality, details } = releaseParts(best)
    return { icon: ListVideo, label: 'Best copy', headline: quality, detail: details }
  }
  return { icon: ListVideo, label: 'Source', headline: 'Picks the best available copy' }
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

  const readout = sourceReadout({ quickPlay, best, existingDownload, bufferingDownload })
  const ReadoutIcon = readout.icon

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Watch options">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={
          inWatchlist
            ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 w-full gap-1.5 rounded-xl'
            : 'w-full gap-1.5 rounded-xl'
        }
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

      {/* One object, two parts: the action on top, the copy it will play attached below. */}
      <div className="border-primary/40 overflow-hidden rounded-xl border shadow-md">
        <Button
          type="button"
          className="h-12 w-full gap-2 rounded-none text-base font-semibold focus-visible:ring-inset"
          disabled={busy}
          onClick={onPlay}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
          {resumeSeconds > 0 ? `Resume from ${formatClock(resumeSeconds)}` : 'Play'}
        </Button>

        <div
          className={cn(
            'border-primary/30 relative flex items-stretch border-t',
            readout.danger ? 'bg-destructive/10' : 'bg-primary/10'
          )}
        >
          <button
            type="button"
            title="See all sources"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors',
              'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
              readout.danger ? 'hover:bg-destructive/10' : 'hover:bg-primary/10'
            )}
            onClick={onShowSources}
          >
            <ReadoutIcon
              className={cn(
                'size-5 shrink-0',
                readout.danger ? 'text-destructive' : 'text-primary'
              )}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5" aria-live="polite">
              <span className={cn('type-kicker', readout.danger && 'text-destructive')}>
                {readout.label}
              </span>
              <span className="text-foreground text-sm leading-snug font-semibold tabular-nums">
                {readout.headline}
              </span>
              {readout.detail && (
                <span className="text-muted-foreground text-xs leading-snug tabular-nums">
                  {readout.detail}
                </span>
              )}
            </span>
            {quickPlay.phase !== 'error' && (
              <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
            )}
            <span className="sr-only">Open all sources</span>
          </button>

          {quickPlay.phase === 'error' && (
            <button
              type="button"
              aria-label="Dismiss error"
              title="Dismiss"
              className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring/50 flex w-12 shrink-0 items-center justify-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset"
              onClick={onDismiss}
            >
              <X className="size-4" />
            </button>
          )}

          {readout.progress !== undefined && (
            <span className="bg-primary/20 pointer-events-none absolute inset-x-0 bottom-0 h-0.5">
              <span
                className="bg-primary block h-full transition-[width] duration-300 ease-out"
                style={{ width: `${Math.round(readout.progress * 100)}%` }}
              />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
