import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import {
  assetNote,
  detectOs,
  downloadLabel,
  formatBytes,
  otherPlatformLabel,
  primaryAsset,
  RELEASES_URL,
  type DownloadsPayload
} from './downloads'

const DownloadsContext = createContext<DownloadsPayload | null>(null)

export function DownloadsProvider({ children }: { children: ReactNode }): ReactElement {
  const [payload, setPayload] = useState<DownloadsPayload | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/v1/site/downloads', { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as DownloadsPayload
        setPayload(response.ok && body.ok ? body : { ok: false, error: 'unavailable' })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPayload({ ok: false, error: 'unavailable' })
      })
    return () => controller.abort()
  }, [])

  return <DownloadsContext.Provider value={payload}>{children}</DownloadsContext.Provider>
}

const buttonClass =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-popcorn px-6 py-3 text-base font-semibold text-popcorn-ink no-underline shadow-[0_12px_32px_rgb(243_223_193/0.18)] transition-[background-color,transform] duration-300 ease-fluid hover:bg-popcorn-bright active:scale-[0.98]'

export function DownloadPanel(): ReactElement {
  const payload = useContext(DownloadsContext)
  const os = detectOs(typeof navigator === 'undefined' ? '' : navigator.userAgent)

  if (payload === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <span
          role="status"
          className="inline-flex min-h-12 w-56 items-center rounded-full bg-surface px-6 text-base text-muted"
        >
          Checking the latest release
        </span>
        <span className="h-5 w-48 rounded bg-surface" />
      </div>
    )
  }

  const assets = payload.ok ? payload.assets : []
  const primary = primaryAsset(os, assets)
  const others = assets.filter((asset) => asset !== primary && asset.os !== primary?.os)
  const size = primary ? formatBytes(primary.size) : ''

  return (
    <div className="flex flex-col items-start gap-3">
      <a className={buttonClass} href={primary?.url ?? RELEASES_URL}>
        {downloadLabel(primary)}
      </a>
      <p className="m-0 text-sm text-muted">
        {primary && payload.ok
          ? `${assetNote(primary)}. Version ${payload.version}${size ? `, ${size}` : ''}.`
          : 'The release list is on GitHub.'}
        {others.map((asset) => (
          <span key={asset.url}>
            {' '}
            Also for{' '}
            <a className="text-ink underline" href={asset.url}>
              {otherPlatformLabel(asset)}
            </a>
            .
          </span>
        ))}
      </p>
    </div>
  )
}
