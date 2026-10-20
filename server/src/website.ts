import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Hono } from 'hono'

/** Same relative path from server/src (tests) and from the esbuild bundle at server/dist. */
export function websiteDistDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../website/dist')
}

export function mountWebsite(app: Hono, root = websiteDistDir()): void {
  if (!existsSync(root)) {
    console.error(`website dist not found at ${root}`)
    return
  }
  const rewriteRequestPath = (path: string): string => path.replace(/^\/+/, '')
  app.use('/assets/*', serveStatic({ root, rewriteRequestPath }))
  app.use('/screenshots/*', serveStatic({ root, rewriteRequestPath }))
  app.get('/favicon.png', serveStatic({ root, path: 'favicon.png' }))
  app.get('/favicon.ico', serveStatic({ root, path: 'favicon.png' }))
  app.get('/', serveStatic({ root, path: 'index.html' }))
}
