import { ArrowLeft } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { Button } from '@/components/ui/button'

const BACKDROP_SLIDE_MS = 8000
const BACKDROP_FADE_MS = 1200

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function cssBackgroundImage(url: string): string {
  return `url("${url.replace(/["\\\n\r]/g, '')}")`
}

function normalizeBackdropUrls(value: string | readonly string[] | null): string[] {
  const list = value == null ? [] : typeof value === 'string' ? [value] : value
  const seen = new Set<string>()
  const urls: string[] = []
  for (const url of list) {
    const trimmed = url.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    urls.push(trimmed)
  }
  return urls
}

function StaticBackdrop({ url }: { url: string }): ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: cssBackgroundImage(url) }}
      aria-hidden
    />
  )
}

function FadingBackdrop({ urls }: { urls: readonly string[] }): ReactElement {
  const frontRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const seenUrl = useRef<string | null>(null)
  const [backUrl, setBackUrl] = useState(urls[0] ?? '')
  const [frontUrl, setFrontUrl] = useState(urls[0] ?? '')

  useLayoutEffect(() => {
    const el = frontRef.current
    if (!el || !frontUrl) return
    if (seenUrl.current === frontUrl) return
    const first = seenUrl.current == null
    seenUrl.current = frontUrl
    el.getAnimations().forEach((animation) => animation.cancel())
    if (first) {
      el.style.opacity = '1'
      return
    }
    el.style.opacity = '0'
    void el.offsetHeight
    el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: BACKDROP_FADE_MS,
      easing: 'ease-in-out',
      fill: 'forwards'
    })
  }, [frontUrl])

  useEffect(() => {
    if (urls.length < 2) return
    const id = window.setInterval(() => {
      const next = (indexRef.current + 1) % urls.length
      const currentUrl = urls[indexRef.current]
      const nextUrl = urls[next]
      if (!currentUrl || !nextUrl) return
      indexRef.current = next
      setBackUrl(currentUrl)
      setFrontUrl(nextUrl)
    }, BACKDROP_SLIDE_MS)
    return () => window.clearInterval(id)
  }, [urls])

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: cssBackgroundImage(backUrl) }}
      />
      <div
        ref={frontRef}
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: cssBackgroundImage(frontUrl) }}
      />
    </div>
  )
}

function BackdropSlideshow({ urls }: { urls: readonly string[] }): ReactElement | null {
  const reducedMotion = usePrefersReducedMotion()
  const first = urls[0]
  if (!first) return null
  if (reducedMotion || urls.length < 2) return <StaticBackdrop url={first} />
  return <FadingBackdrop urls={urls} />
}

export function MoviePageShell({
  backdropImageUrl,
  onBack,
  children
}: {
  backdropImageUrl: string | readonly string[] | null
  onBack: () => void
  children: ReactNode
}): ReactElement {
  const urls = useMemo(() => normalizeBackdropUrls(backdropImageUrl), [backdropImageUrl])

  return (
    <div className="relative flex min-h-full flex-col">
      <BackdropSlideshow key={urls.join('\n')} urls={urls} />
      <div className="pointer-events-none absolute inset-0 bg-background/70" />
      <Button
        variant="outline"
        size="icon"
        type="button"
        className="absolute top-4 left-4 z-20 size-10 border-border bg-background/90 text-foreground shadow-md backdrop-blur-sm hover:bg-background hover:text-foreground"
        aria-label="Go back"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden />
      </Button>
      <div className="relative z-10 mt-[100px] flex w-full justify-center px-4 pb-8 sm:px-6">
        <main className="border-border bg-background/90 w-full max-w-6xl rounded-2xl border p-6 shadow-lg backdrop-blur-sm sm:p-8 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
