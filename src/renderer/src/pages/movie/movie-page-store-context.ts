import { createContext, useContext } from 'react'
import type { MoviePageSlice, MoviePageStoreApi } from './movie-page-store'

export const MoviePageStoreContext = createContext<MoviePageStoreApi | null>(null)

export function useMoviePageStore<T>(selector: (state: MoviePageSlice) => T): T {
  const useBoundStore = useContext(MoviePageStoreContext)
  if (useBoundStore == null) {
    throw new Error('useMoviePageStore must be used within MoviePageStoreContext.Provider')
  }
  return useBoundStore(selector)
}
