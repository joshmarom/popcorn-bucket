import type { TorrentSubtitleTrack } from '@shared/torrent-stream'
import type { ReactElement } from 'react'
import { useMemo, useRef } from 'react'
import { alignLoopbackStreamUrlToPageHost } from '@/lib/local-stream-url'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  MediaPlayer,
  MediaProvider,
  Track,
  type MediaErrorDetail,
  type MediaPlayerInstance
} from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'

function isLocalAppStreamUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//i.test(url) || url.startsWith('pb-media:')
}

export function MoviePlaybackDialog({
  open,
  playUrl,
  playLabel,
  playSubtitles,
  playError,
  startSeconds,
  onOpenChange,
  onPlayerError,
  onProgress
}: {
  open: boolean
  playUrl: string | null
  playLabel: string
  playSubtitles: TorrentSubtitleTrack[]
  playError: string | null
  startSeconds: number
  onOpenChange: (open: boolean) => void
  onPlayerError: (detail: MediaErrorDetail) => void
  /** Called every few seconds and on close with the current position. */
  onProgress: (position: number, duration: number) => void
}): ReactElement {
  const playerRef = useRef<MediaPlayerInstance>(null)
  const lastReport = useRef(0)
  const report = (force: boolean): void => {
    const p = playerRef.current
    if (!p) return
    const now = Date.now()
    if (!force && now - lastReport.current < 5000) return
    lastReport.current = now
    const { currentTime, duration } = p.state
    if (duration > 0) onProgress(currentTime, duration)
  }
  const crossOrigin = useMemo(() => {
    if (!playUrl || isLocalAppStreamUrl(playUrl)) return undefined
    return 'anonymous' as const
  }, [playUrl])

  const resolvedPlayUrl = useMemo(() => {
    return playUrl ? alignLoopbackStreamUrlToPageHost(playUrl) : null
  }, [playUrl])

  const resolvedSubtitles = useMemo(() => {
    return playSubtitles.map((s) => ({ ...s, src: alignLoopbackStreamUrlToPageHost(s.src) }))
  }, [playSubtitles])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) report(true)
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{playLabel}</DialogTitle>
        </DialogHeader>
        {resolvedPlayUrl ? (
          <MediaPlayer
            key={resolvedPlayUrl}
            ref={playerRef}
            src={resolvedPlayUrl}
            playsInline
            onCanPlay={() => {
              const p = playerRef.current
              if (p && startSeconds > 0 && p.state.currentTime < 1) p.currentTime = startSeconds
            }}
            onTimeUpdate={() => report(false)}
            onPause={() => report(true)}
            {...(crossOrigin ? { crossOrigin } : {})}
            className="aspect-video w-full overflow-hidden rounded-md bg-black"
            onError={onPlayerError}
          >
            <MediaProvider>
              {resolvedSubtitles.map((s) => (
                <Track
                  key={s.src}
                  src={s.src}
                  kind="subtitles"
                  label={s.label}
                  {...(s.language ? { lang: s.language } : {})}
                  type={s.type}
                />
              ))}
            </MediaProvider>
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
        ) : null}
        {playLabel ? (
          <p className="text-muted-foreground truncate text-xs" title={playLabel}>
            {playLabel}
          </p>
        ) : null}
        {playError ? <p className="text-destructive text-sm leading-relaxed">{playError}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
