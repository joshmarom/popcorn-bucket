import './globals.css'
import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppRouter } from '@/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>
)
