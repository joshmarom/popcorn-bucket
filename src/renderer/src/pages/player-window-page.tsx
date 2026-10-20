import type { InlinePlayerSession } from '@shared/torrent-stream'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alignLoopbackStreamUrlToPageHost } from '@/lib/local-stream-url'
import MKVWeb, { isMkvSource } from '@/lib/mkv-web/mkv-web'
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

function isLocalAppStreamUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//i.test(url) || url.startsWith('pb-media:')
}

export function PlayerWindowPage(): ReactElement {
  const [session, setSession] = useState<InlinePlayerSession | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [openingMpv, setOpeningMpv] = useState(false)
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

  const isMkv = useMemo(() => {
    return isMkvSource(resolvedPlayUrl, session?.fileLabel)
  }, [resolvedPlayUrl, session?.fileLabel])

  const mkvInstance = useMemo<MKVWeb | null>(() => {
    if (!resolvedPlayUrl || !isMkv) return null
    return new MKVWeb()
  }, [resolvedPlayUrl, isMkv])

  useEffect(() => {
    if (!mkvInstance) return
    mkvInstance.retain()
    const onError = (err: Error): void => {
      setPlayError(err.message || 'MKV playback failed.')
    }
    mkvInstance.addErrorCallback(onError)
    return () => {
      mkvInstance.release()
    }
  }, [mkvInstance])

  const playerSrc = useMemo<PlayerSrc | null>(() => {
    if (!resolvedPlayUrl) return null
    if (isMkv) {
      if (!mkvInstance) return null
      return { src: mkvInstance.mediaSource, type: 'video/object' }
    }
    return resolvedPlayUrl
  }, [resolvedPlayUrl, isMkv, mkvInstance])

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
    return (session?.subtitles ?? []).map((s) => ({
      ...s,
      src: alignLoopbackStreamUrlToPageHost(s.src)
    }))
  }, [session?.subtitles])

  const openInMpv = useCallback(async (): Promise<void> => {
    const s = sessionRef.current
    if (!s || openingMpv) return
    const p = playerRef.current
    const position = p?.state.currentTime ?? s.startSeconds
    const duration = p?.state.duration ?? 0
    setOpeningMpv(true)
    setPlayError(null)
    p?.pause()
    if (duration > 0) {
      await window.api.history.report(s.movieId, position, duration)
    }
    try {
      const openInMpv = window.api.player.openInMpv
      if (!openInMpv) {
        throw new Error('Restart the app to enable Open in mpv.')
      }
      const res = await openInMpv(position)
      if (!res.ok) {
        setPlayError(res.error)
        setOpeningMpv(false)
        void p?.play()
      }
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : 'Could not open mpv.')
      setOpeningMpv(false)
      void p?.play()
    }
  }, [openingMpv])

  const handlePlayerError = (d: MediaErrorDetail): void => {
    const msg = d.message || 'Video playback failed.'
    const code = d.code
    setPlayError(code != null ? `${msg} (code ${code})` : msg)
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-black text-white">
      {playerSrc && resolvedPlayUrl && session ? (
        <MediaPlayer
          key={`${session.downloadId}:${resolvedPlayUrl}`}
          ref={playerRef}
          title={session.fileLabel}
          src={playerSrc}
          autoPlay
          playsInline
          onProviderSetup={handleProviderSetup}
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
      {session ? (
        <button
          type="button"
          className="pointer-events-auto absolute top-3 right-3 z-[200] rounded-md border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-xs hover:bg-black/90 disabled:opacity-50"
          disabled={openingMpv}
          onClick={(e) => {
            e.stopPropagation()
            void openInMpv()
          }}
        >
          {openingMpv ? 'Opening mpv…' : 'Open in mpv'}
        </button>
      ) : null}
      {playError ? (
        <div className="border-destructive/40 bg-destructive/20 pointer-events-auto absolute inset-x-4 bottom-16 z-50 rounded-md border px-4 py-3 text-sm text-white backdrop-blur-xs">
          {playError}
        </div>
      ) : null}
    </div>
  )
}
