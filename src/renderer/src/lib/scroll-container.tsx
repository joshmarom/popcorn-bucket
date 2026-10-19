import { createContext, useContext } from 'react'

/** The app's main scroll box. Pages scroll inside it, so virtual lists measure against it. */
export const ScrollContainerContext = createContext<HTMLElement | null>(null)

export function useScrollContainer(): HTMLElement | null {
  return useContext(ScrollContainerContext)
}
