import type { InlinePlayerSession } from '@shared/torrent-stream'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alignLoopbackStreamUrlToPageHost } from '@/lib/local-stream-url'
import {
  MediaPlayer,
  MediaProvider,
  Track,
  type MediaErrorDetail,
  type MediaPlayerInstance
} from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'
import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

function isLocalAppStreamUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//i.test(url) || url.startsWith('pb-media:')
}

export function PlayerWindowPage(): ReactElement {
  const [session, setSession] = useState<InlinePlayerSession | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const playerRef = useRef<MediaPlayerInstance>(null)
  const sessionRef = useRef<InlinePlayerSession | null>(null)
  const lastReportRef = useRef(0)

  const report = useCallback((force: boolean): void => {
    const p = playerRef.current
    const s = sessionRef.current
    if (!p || !s) return
    const now = Date.now()
    if (!force && now - lastReportRef.current < 5000) return
    lastReportRef.current = now
    const { currentTime, duration } = p.state
    if (duration > 0) {
      void window.api.history.report(s.movieId, currentTime, duration)
    }
  }, [])

  useEffect(() => {
    const apply = (next: InlinePlayerSession | null): void => {
      if (sessionRef.current && next && sessionRef.current.downloadId !== next.downloadId) {
        report(true)
      }
      sessionRef.current = next
      setSession(next)
      setPlayError(null)
      if (next?.fileLabel) {
        document.title = next.fileLabel
      }
    }
    void window.api.player.getSession().then(apply)
    return window.api.player.onSession(apply)
  }, [report])

  useEffect(() => {
    const onBeforeUnload = (): void => {
      report(true)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [report])

  const playUrl = session?.streamUrl ?? null

  const crossOrigin = useMemo(() => {
    if (!playUrl || isLocalAppStreamUrl(playUrl)) return undefined
    return 'anonymous' as const
  }, [playUrl])

  const resolvedPlayUrl = useMemo(() => {
    return playUrl ? alignLoopbackStreamUrlToPageHost(playUrl) : null
  }, [playUrl])

  const resolvedSubtitles = useMemo(() => {
    return (session?.subtitles ?? []).map((s) => ({
      ...s,
      src: alignLoopbackStreamUrlToPageHost(s.src)
    }))
  }, [session?.subtitles])

  const handlePlayerError = (d: MediaErrorDetail): void => {
    const msg = d.message || 'Video playback failed.'
    const code = d.code
    setPlayError(code != null ? `${msg} (code ${code})` : msg)
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white">
      {resolvedPlayUrl && session ? (
        <MediaPlayer
          key={`${session.downloadId}:${resolvedPlayUrl}`}
          ref={playerRef}
          title={session.fileLabel}
          src={resolvedPlayUrl}
          autoPlay
          playsInline
          onCanPlay={() => {
            const p = playerRef.current
            if (p && session.startSeconds > 0 && p.state.currentTime < 1) {
              p.currentTime = session.startSeconds
            }
          }}
          onTimeUpdate={() => report(false)}
          onPause={() => report(true)}
          onEnded={() => report(true)}
          {...(crossOrigin ? { crossOrigin } : {})}
          className="size-full overflow-hidden bg-black"
          onError={handlePlayerError}
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
      ) : (
        <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
          Loading player…
        </div>
      )}
      {playError ? (
        <div className="border-destructive/40 bg-destructive/20 pointer-events-auto absolute inset-x-4 bottom-16 z-50 rounded-md border px-4 py-3 text-sm text-white backdrop-blur-xs">
          {playError}
        </div>
      ) : null}
    </div>
  )
}
