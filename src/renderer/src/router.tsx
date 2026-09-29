import { createHashRouter, Navigate, RouterProvider, useParams } from 'react-router-dom'
import type { ReactElement } from 'react'
import { RootLayout } from '@/layouts/root-layout'
import { DownloadsPage } from '@/pages/downloads-page'
import { GenreBrowsePage } from '@/pages/genre-browse-page'
import { HomePage } from '@/pages/home-page'
import { MoviePage } from '@/pages/movie/movie-page'
import { SettingsPage, SignInGate } from '@/pages/settings-page'
import { LibraryPage } from '@/pages/library-page'
import { CollectionPage } from '@/pages/collection-page'
import { TvBrowsePage } from '@/pages/tv-browse-page'
import { TvShowPage } from '@/pages/tv-show-page'
import { TvGenrePage } from '@/pages/tv-genre-page'

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
  return (
    <SignInGate>
      <RouterProvider router={router} />
    </SignInGate>
  )
}
