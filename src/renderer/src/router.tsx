import { createHashRouter, RouterProvider, useParams } from 'react-router-dom'
import type { ReactElement } from 'react'
import { RootLayout } from '@/layouts/root-layout'
import { DownloadsPage } from '@/pages/downloads-page'
import { GenreBrowsePage } from '@/pages/genre-browse-page'
import { HomePage } from '@/pages/home-page'
import { MoviePage } from '@/pages/movie/movie-page'
import { SettingsPage } from '@/pages/settings-page'
import { ContinuePage } from '@/pages/continue-page'
import { TvBrowsePage } from '@/pages/tv-browse-page'
import { TvShowPage } from '@/pages/tv-show-page'

function MovieRoute(): ReactElement {
  const { movieId } = useParams()
  return <MoviePage key={movieId ?? ''} />
}

const router = createHashRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'genre/:genreId', element: <GenreBrowsePage /> },
      { path: 'movie/:movieId', element: <MovieRoute /> },
      { path: 'continue', element: <ContinuePage /> },
      { path: 'tv', element: <TvBrowsePage /> },
      { path: 'tv/:showId', element: <TvShowPage /> },
      { path: 'downloads', element: <DownloadsPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

export function AppRouter(): ReactElement {
  return <RouterProvider router={router} />
}
