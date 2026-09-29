import './env'
import { existsSync, fstatSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createAdaptorServer } from '@hono/node-server'
import { Hono } from 'hono'
import pg from 'pg'
import { registerCatalogRoutes } from './catalog-routes'
import { registerTorrentRoutes } from './torrent-routes'
import { migrate } from './migrate'
import { pgConfig } from './pg-config'

loadEnvFile(join(homedir(), '.config', 'popcorn', 'env'))

const app = new Hono()
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

migrate()
  .then(() => {
    console.log('database schema is current')
  })
  .catch((error: unknown) => {
    console.error('database migration failed')
    console.error(error instanceof Error ? error.message : error)
  })

const server = createAdaptorServer({ fetch: app.fetch })
server.on('error', (error) => {
  console.error('listen failed')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
listen(server)

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
    server.listen({ port, hostname: '127.0.0.1' }, onListening)
    return
  }
  console.error('systemd socket was not passed. Refusing to open a port.')
  process.exit(1)
}

function socketFd(fd: number): boolean {
  try {
    return fstatSync(fd).isSocket()
  } catch {
    return false
  }
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}
