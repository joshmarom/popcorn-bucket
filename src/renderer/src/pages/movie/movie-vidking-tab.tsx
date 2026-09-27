import type { CatalogMovieDetails } from '@shared/catalog'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function MovieVidkingTab({ detail }: { detail: CatalogMovieDetails }): ReactElement {
  const embedUrl = `https://vidsrc.sh/embed/movie/${detail.id}`
  const [iframeKey, setIframeKey] = useState(0)
  const [clearing, setClearing] = useState(false)
  const [copyingDiag, setCopyingDiag] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const handleClearData = async (): Promise<void> => {
    setClearing(true)
    setNotice(null)
    try {
      await window.api.app.clearVidkingData()
      setIframeKey((n) => n + 1)
      setNotice('Cleared cached VidSrc data and reloaded the player.')
    } catch {
      setNotice('Could not clear cached VidSrc data.')
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
          ? `Copied ${rows.length} VidSrc diagnostic events to clipboard.`
          : 'No VidSrc diagnostic events captured yet.'
      )
    } catch {
      setNotice('Could not copy VidSrc diagnostics.')
    } finally {
      setCopyingDiag(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-black shadow-sm">
        <webview
          key={iframeKey}
          title={`VidSrc — ${detail.title}`}
          src={embedUrl}
          partition="persist:vidking"
          allowpopups
          className="flex aspect-video w-full min-h-[420px] border-0"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void window.api.app.openVidkingEmbed(embedUrl)}
        >
          Open in popup window
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void window.api.app.openExternal(embedUrl)}
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
          {clearing ? 'Clearing…' : 'Clear VidSrc cached data & reload'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleCopyDiagnostics()}
          disabled={copyingDiag}
        >
          {copyingDiag ? 'Copying…' : 'Copy VidSrc diagnostics'}
        </Button>
      </div>
      {notice ? <p className="text-muted-foreground text-xs">{notice}</p> : null}
    </div>
  )
}
