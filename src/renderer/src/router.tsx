import { createHashRouter, Navigate, RouterProvider, useParams } from 'react-router-dom'
import { lazy, type ReactElement } from 'react'
import { RootLayout } from '@/layouts/root-layout'
import { GenreBrowsePage } from '@/pages/genre-browse-page'
import { HomePage } from '@/pages/home-page'
import { LibraryPage } from '@/pages/library-page'
import { CollectionPage } from '@/pages/collection-page'
import { TvBrowsePage } from '@/pages/tv-browse-page'
import { TvGenrePage } from '@/pages/tv-genre-page'

const MoviePage = lazy(() =>
  import('@/pages/movie/movie-page').then((mod) => ({ default: mod.MoviePage }))
)
const TvShowPage = lazy(() =>
  import('@/pages/tv-show-page').then((mod) => ({ default: mod.TvShowPage }))
)
const DownloadsPage = lazy(() =>
  import('@/pages/downloads-page').then((mod) => ({ default: mod.DownloadsPage }))
)
const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((mod) => ({ default: mod.SettingsPage }))
)

function MovieRoute(): ReactElement {
  const { movieId } = useParams()
  return <MoviePage key={movieId ?? ''} />
}

function TvGenreRoute(): ReactElement {
  const { genreId } = useParams()
  return <TvGenrePage key={genreId ?? ''} />
}

function CollectionRoute(): ReactElement {
  const { collectionId } = useParams()
  return <CollectionPage key={collectionId ?? ''} />
}

const router = createHashRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'genre/:genreId', element: <GenreBrowsePage /> },
      { path: 'collection/:collectionId', element: <CollectionRoute /> },
      { path: 'movie/:movieId', element: <MovieRoute /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'continue', element: <Navigate to="/library" replace /> },
      { path: 'tv', element: <TvBrowsePage /> },
      { path: 'tv/genre/:genreId', element: <TvGenreRoute /> },
      { path: 'tv/:showId', element: <TvShowPage /> },
      { path: 'downloads', element: <DownloadsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

export function AppRouter(): ReactElement {
  return <RouterProvider router={router} />
}
