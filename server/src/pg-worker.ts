import { parentPort, workerData } from 'node:worker_threads'
import pg from 'pg'
import { pgConfig } from './pg-config'

type QueryMsg = { id: number; op: 'query'; text: string; params: unknown[] }
type ExecMsg = { id: number; op: 'exec'; text: string }
type InitMsg = { type: 'init'; port: import('node:worker_threads').MessagePort }

const data = workerData as { connectionString: string; sab: SharedArrayBuffer }
const lock = new Int32Array(data.sab)

pg.types.setTypeParser(20, (value) => Number(value))

const client = new pg.Client(pgConfig(data.connectionString))

let reply: import('node:worker_threads').MessagePort | null = null

function finish(id: number, body: Record<string, unknown>): void {
  reply?.postMessage({ id, ...body })
  Atomics.store(lock, 0, 1)
  Atomics.notify(lock, 0)
}

parentPort?.on('message', (msg: InitMsg | QueryMsg | ExecMsg) => {
  if ('type' in msg && msg.type === 'init') {
    reply = msg.port
    return
  }
  void handle(msg as QueryMsg | ExecMsg)
})

await client.connect()
Atomics.store(lock, 0, 1)
Atomics.notify(lock, 0)

async function handle(msg: QueryMsg | ExecMsg): Promise<void> {
  try {
    if (msg.op === 'exec') {
      await client.query(msg.text)
      finish(msg.id, { rowCount: 0, rows: [] })
      return
    }
    const result = await client.query(msg.text, msg.params)
    finish(msg.id, { rowCount: result.rowCount ?? 0, rows: result.rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    finish(msg.id, { error: message })
  }
}
