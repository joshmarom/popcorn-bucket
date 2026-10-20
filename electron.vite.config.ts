import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        /** ESM + top-level await — must load via `import()`, not bundled `require()`. */
        external: ['webtorrent', 'better-sqlite3']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      /** Sandboxed preloads cannot `require()` from node_modules, so bundle everything. */
      externalizeDeps: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless'
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
