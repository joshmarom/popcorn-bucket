import { ArrowLeft } from 'lucide-react'
import { useMemo, type ReactElement, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function MoviePageShell({
  backdropImageUrl,
  onBack,
  children
}: {
  backdropImageUrl: string | null
  onBack: () => void
  children: ReactNode
}): ReactElement {
  const style = useMemo<React.CSSProperties>(
    () =>
      backdropImageUrl
        ? {
            backgroundImage: `url(${backdropImageUrl})`
          }
        : {},
    [backdropImageUrl]
  )

  return (
    <div
      className="relative min-h-full bg-cover bg-center bg-no-repeat flex items-start justify-center"
      style={style}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/90" />
      <div className="relative mt-10 w-6xl space-y-4 rounded-2xl bg-black/60 p-8 pb-12 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="size-9 shrink-0"
            aria-label="Go back"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
