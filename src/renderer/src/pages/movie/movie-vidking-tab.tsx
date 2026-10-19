import type { CatalogMovieDetails } from '@shared/catalog'
import type { ReactElement } from 'react'
import { VidcorePlayer } from '@/components/vidcore-player'

export function MovieVidkingTab({ detail }: { detail: CatalogMovieDetails }): ReactElement {
  return <VidcorePlayer title={detail.title} src={`https://vidcore.org/embed/movie/${detail.id}`} />
}
