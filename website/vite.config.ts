import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig, type Plugin } from 'vite'
import { loadSiteDownloads } from '../server/src/site-downloads.ts'

/** The hosted API does not have this route until the site is deployed, so dev answers it locally. */
function devDownloads(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end()
      return
    }
    void loadSiteDownloads().then((body) => {
      res.statusCode = body.ok ? 200 : 502
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.end(JSON.stringify(body))
    })
  }
  return {
    name: 'dev-downloads',
    configureServer(server) {
      server.middlewares.use('/v1/site/downloads', handler)
    }
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devDownloads()],
  server: {
    proxy: {
      '/v1': { target: 'https://popcorn.josh.co.il', changeOrigin: true },
      '/media': { target: 'https://popcorn.josh.co.il', changeOrigin: true }
    }
  }
})
