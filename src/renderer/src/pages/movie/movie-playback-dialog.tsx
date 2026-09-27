import type { TorrentSubtitleTrack } from '@shared/torrent-stream'
import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { alignLoopbackStreamUrlToPageHost } from '@/lib/local-stream-url'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MediaPlayer, MediaProvider, Track, type MediaErrorDetail } from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'

function isLocalAppStreamUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//i.test(url)
}

export function MoviePlaybackDialog({
  open,
  playUrl,
  playLabel,
  playSubtitles,
  playError,
  onOpenChange,
  onPlayerError
}: {
  open: boolean
  playUrl: string | null
  playLabel: string
  playSubtitles: TorrentSubtitleTrack[]
  playError: string | null
  onOpenChange: (open: boolean) => void
  onPlayerError: (detail: MediaErrorDetail) => void
}): ReactElement {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{playLabel}</DialogTitle>
        </DialogHeader>
        {resolvedPlayUrl ? (
          <MediaPlayer
            key={resolvedPlayUrl}
            src={resolvedPlayUrl}
            playsInline
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
