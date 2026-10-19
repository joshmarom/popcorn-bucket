import type { CatalogMovieDetails } from '@shared/catalog'
import type { ReactElement } from 'react'
import { VidcorePlayer } from '@/components/vidcore-player'

export function MovieVidkingTab({ detail }: { detail: CatalogMovieDetails }): ReactElement {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Plays in the browser. Nothing is downloaded to this computer.
      </p>
      <VidcorePlayer title={detail.title} src={`https://vidcore.org/embed/movie/${detail.id}`} />
    </div>
  )
}
