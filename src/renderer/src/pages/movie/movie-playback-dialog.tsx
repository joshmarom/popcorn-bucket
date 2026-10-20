import type { TorrentSubtitleTrack } from '@shared/torrent-stream'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { alignLoopbackStreamUrlToPageHost } from '@/lib/local-stream-url'
import MKVWeb, { isMkvSource } from '@/lib/mkv-web/mkv-web'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  isVideoProvider,
  MediaPlayer,
  MediaProvider,
  Track,
  type MediaErrorDetail,
  type MediaPlayerInstance,
  type MediaProviderAdapter,
  type PlayerSrc
} from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'
import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

export type MoviePlaybackDialogProps = {
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
}

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
}: MoviePlaybackDialogProps): ReactElement {
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

  const isMkv = useMemo(() => {
    return isMkvSource(resolvedPlayUrl, playLabel)
  }, [resolvedPlayUrl, playLabel])

  const mkvInstance = useMemo<MKVWeb | null>(() => {
    if (!open || !resolvedPlayUrl || !isMkv) return null
    return new MKVWeb()
  }, [open, resolvedPlayUrl, isMkv])

  useEffect(() => {
    if (!mkvInstance) return
    mkvInstance.retain()
    mkvInstance.addErrorCallback((err) => {
      onPlayerError({
        message: err.message || 'MKV playback failed.',
        code: 4
      })
    })
    return () => {
      mkvInstance.release()
    }
  }, [mkvInstance, onPlayerError])

  const playerSrc = useMemo<PlayerSrc | null>(() => {
    if (!open || !resolvedPlayUrl) return null
    if (isMkv) {
      if (!mkvInstance) return null
      return { src: mkvInstance.mediaSource, type: 'video/object' }
    }
    return resolvedPlayUrl
  }, [open, resolvedPlayUrl, isMkv, mkvInstance])

  const handleProviderSetup = useCallback(
    (provider: MediaProviderAdapter): void => {
      if (isMkv && mkvInstance && resolvedPlayUrl && isVideoProvider(provider)) {
        mkvInstance.attachVideo(provider.video)
        void mkvInstance.loadMedia(resolvedPlayUrl)
      }
    },
    [isMkv, mkvInstance, resolvedPlayUrl]
  )

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
        {playerSrc && resolvedPlayUrl ? (
          <MediaPlayer
            key={resolvedPlayUrl}
            ref={playerRef}
            src={playerSrc}
            playsInline
            onProviderSetup={handleProviderSetup}
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
