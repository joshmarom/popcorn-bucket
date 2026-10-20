import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmbedWebview = HTMLElement & {
  addEventListener(type: 'enter-html-full-screen' | 'leave-html-full-screen', listener: () => void): void
  removeEventListener(
    type: 'enter-html-full-screen' | 'leave-html-full-screen',
    listener: () => void
  ): void
}

export function VidcorePlayer({ title, src }: { title: string; src: string }): ReactElement {
  const webviewRef = useRef<EmbedWebview | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [playerFullscreen, setPlayerFullscreen] = useState(false)
  const [fullscreenSrc, setFullscreenSrc] = useState(src)
  const [clearing, setClearing] = useState(false)
  const [copyingDiag, setCopyingDiag] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const playerKey = `${reloadKey}:${src}`

  if (src !== fullscreenSrc) {
    setFullscreenSrc(src)
    setPlayerFullscreen(false)
  }

  useEffect(() => {
    const el = webviewRef.current
    if (!el) return
    const onEnter = (): void => setPlayerFullscreen(true)
    const onLeave = (): void => setPlayerFullscreen(false)
    el.addEventListener('enter-html-full-screen', onEnter)
    el.addEventListener('leave-html-full-screen', onLeave)
    return () => {
      el.removeEventListener('enter-html-full-screen', onEnter)
      el.removeEventListener('leave-html-full-screen', onLeave)
    }
  }, [playerKey])

  useLayoutEffect(() => {
    const el = webviewRef.current
    if (!el || !playerFullscreen) return

    // The back button and tabs live in stacking contexts above this card
    // (z-20, backdrop-filter). A z-index on the webview cannot escape those,
    // so the player is hoisted to the document while it is fullscreen.
    const marker = document.createComment('vidcore-fullscreen')
    el.parentNode?.insertBefore(marker, el)
    document.body.appendChild(el)

    const place = (): void => {
      el.style.position = 'fixed'
      el.style.zIndex = '2147483646'
      el.style.margin = '0'
      el.style.top = '0'
      el.style.left = '0'
      el.style.width = `${window.innerWidth}px`
      el.style.height = `${window.innerHeight}px`
      el.style.background = '#000'
    }

    place()
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
      if (marker.parentNode) marker.parentNode.insertBefore(el, marker)
      marker.remove()
      el.style.position = ''
      el.style.zIndex = ''
      el.style.margin = ''
      el.style.top = ''
      el.style.left = ''
      el.style.width = ''
      el.style.height = ''
      el.style.background = ''
    }
  }, [playerFullscreen, playerKey])

  const handleClearData = async (): Promise<void> => {
    setClearing(true)
    setNotice(null)
    try {
      await window.api.app.clearVidkingData()
      setReloadKey((n) => n + 1)
      setNotice('Cleared cached VidCore data and reloaded the player.')
    } catch {
      setNotice('Could not clear cached VidCore data.')
    } finally {
      setClearing(false)
    }
  }

  const handleCopyDiagnostics = async (): Promise<void> => {
    setCopyingDiag(true)
    setNotice(null)
    try {
      const rows = await window.api.app.getVidkingDiagnostics()
      const text = JSON.stringify(rows, null, 2)
      await navigator.clipboard.writeText(text)
      setNotice(
        rows.length > 0
          ? `Copied ${rows.length} VidCore diagnostic events to clipboard.`
          : 'No VidCore diagnostic events captured yet.'
      )
    } catch {
      setNotice('Could not copy VidCore diagnostics.')
    } finally {
      setCopyingDiag(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-black shadow-sm">
        <webview
          key={playerKey}
          ref={webviewRef}
          title={`VidCore — ${title}`}
          src={src}
          partition="persist:vidking"
          allowpopups
          className={cn(
            'border-0 bg-black',
            playerFullscreen ? 'max-w-none' : 'flex aspect-video w-full min-h-[420px]'
          )}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void window.api.app.openVidkingEmbed(src)}>
          Open in popup window
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void window.api.app.openExternal(src)}
        >
          Open embed in browser
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleClearData()}
          disabled={clearing}
        >
          {clearing ? 'Clearing…' : 'Clear VidCore cached data & reload'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleCopyDiagnostics()}
          disabled={copyingDiag}
        >
          {copyingDiag ? 'Copying…' : 'Copy VidCore diagnostics'}
        </Button>
      </div>
      {notice ? <p className="text-muted-foreground text-xs">{notice}</p> : null}
    </div>
  )
}
