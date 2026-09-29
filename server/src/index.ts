import './env'
import { fstatSync } from 'node:fs'
import { createAdaptorServer } from '@hono/node-server'
import { Hono } from 'hono'
import pg from 'pg'
import { createAuth, requireSession } from './auth'
import { registerCatalogRoutes } from './catalog-routes'
import { registerMediaRoutes } from './media-routes'
import { registerMeRoutes } from './me-routes'
import { registerSubtitleRoutes } from './subtitle-routes'
import { registerTorrentRoutes } from './torrent-routes'
import { migrate } from './migrate'
import { pgConfig } from './pg-config'

const app = new Hono()
registerMediaRoutes(app)
mountAuth(app)
registerCatalogRoutes(app)
registerTorrentRoutes(app)

app.get('/health', async (c) => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return c.json({ ok: false, error: 'DATABASE_URL is not set' }, 503)
  const client = new pg.Client(pgConfig(databaseUrl))
  try {
    await client.connect()
    await client.query('SELECT 1')
    return c.json({ ok: true })
  } catch {
    return c.json({ ok: false, error: 'database unreachable' }, 503)
  } finally {
    await client.end().catch(() => undefined)
  }
})

const server = createAdaptorServer({ fetch: app.fetch })
server.on('error', (error) => {
  console.error('listen failed')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

migrate()
  .then(() => {
    console.log('database schema is current')
    listen(server)
  })
  .catch((error: unknown) => {
    console.error('database migration failed')
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })

function listen(server: ReturnType<typeof createAdaptorServer>): void {
  const onListening = (): void => {
    const address = server.address()
    if (address && typeof address === 'object' && 'port' in address) {
      console.log(`listening on ${address.address}:${address.port}`)
    } else {
      console.log(`listening on ${String(address)}`)
    }
  }
  const fds = Number(process.env.LISTEN_FDS)
  console.error(
    `startup pid=${process.pid} listenPid=${process.env.LISTEN_PID ?? ''} listenFds=${process.env.LISTEN_FDS ?? ''} fd3=${socketFd(3)}`
  )
  if (Number.isInteger(fds) && fds > 0) {
    server.listen({ fd: 3 }, onListening)
    return
  }
  if (socketFd(3)) {
    server.listen({ fd: 3 }, onListening)
    return
  }
  const port = Number(process.env.PORT)
  if (Number.isInteger(port) && port > 0) {
    server.listen({ port, host: '127.0.0.1' }, onListening)
    return
  }
  console.error('systemd socket was not passed. Refusing to open a port.')
  process.exit(1)
}

function mountAuth(app: Hono): void {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
    console.error('auth disabled: DATABASE_URL or BETTER_AUTH_SECRET is not set')
    return
  }
  try {
    const auth = createAuth()
    const signedIn = requireSession(auth)
    app.on(['GET', 'POST'], '/v1/auth/*', (c) => auth.handler(c.req.raw))
    app.use('/v1/catalog/*', signedIn)
    app.use('/v1/tv/*', signedIn)
    app.use('/v1/discover/*', signedIn)
    app.use('/v1/torrents/*', signedIn)
    app.use('/v1/me/*', signedIn)
    app.use('/v1/subtitles/*', signedIn)
    registerMeRoutes(app)
    registerSubtitleRoutes(app)
  } catch (error) {
    console.error('auth init failed')
    console.error(error instanceof Error ? error.message : error)
  }
}

function socketFd(fd: number): boolean {
  try {
    return fstatSync(fd).isSocket()
  } catch {
    return false
  }
}

