import { Worker, receiveMessageOnPort, MessageChannel } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toPostgres } from '../sql-dialect'

type Reply = { id: number; rows?: Record<string, unknown>[]; rowCount?: number; error?: string }

type Call =
  | { op: 'query'; text: string; params: unknown[] }
  | { op: 'exec'; text: string }

let callFn: ((body: Call) => Reply) | null = null

function client(): (body: Call) => Reply {
  if (callFn) return callFn
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const sab = new SharedArrayBuffer(4)
  const lock = new Int32Array(sab)
  const workerPath = join(dirname(fileURLToPath(import.meta.url)), 'pg-worker.js')
  const worker = new Worker(workerPath, { workerData: { connectionString, sab } })
  const ready = Atomics.wait(lock, 0, 0, 30_000)
  if (ready === 'timed-out') throw new Error('Postgres worker did not start')

  const { port1, port2 } = new MessageChannel()
  worker.postMessage({ type: 'init', port: port2 }, [port2])

  let seq = 0
  callFn = (body) => {
    const id = ++seq
    Atomics.store(lock, 0, 0)
    worker.postMessage({ ...body, id })
    const waited = Atomics.wait(lock, 0, 0, 120_000)
    if (waited === 'timed-out') throw new Error('Postgres call timed out')
    const received = receiveMessageOnPort(port1)
    if (!received) throw new Error('Postgres worker returned no message')
    const reply = received.message as Reply
    if (reply.error) throw new Error(reply.error)
    return reply
  }
  return callFn
}

/** Drop-in for better-sqlite3. The file path is ignored; rows live in Postgres. */
export default class Database {
  constructor(_filename?: string) {
    client()
  }

  pragma(_source: string): unknown {
    return undefined
  }

  exec(sql: string): this {
    for (const statement of sql
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.startsWith('--'))) {
      client()({ op: 'exec', text: statement })
    }
    return this
  }

  prepare(sql: string): {
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown[]
    run: (...args: unknown[]) => { changes: number; lastInsertRowid: number }
  } {
    return {
      get: (...args: unknown[]): unknown => {
        const bound = toPostgres(sql, args)
        return client()({ op: 'query', text: bound.text, params: bound.params }).rows?.[0]
      },
      all: (...args: unknown[]): unknown[] => {
        const bound = toPostgres(sql, args)
        return client()({ op: 'query', text: bound.text, params: bound.params }).rows ?? []
      },
      run: (...args: unknown[]): { changes: number; lastInsertRowid: number } => {
        let text = sql
        if (/^insert\s+into\s+lists\b/i.test(text) && !/returning/i.test(text)) {
          text = `${text.trimEnd()} RETURNING id`
        }
        const bound = toPostgres(text, args)
        const reply = client()({ op: 'query', text: bound.text, params: bound.params })
        const id = reply.rows?.[0]?.id
        return {
          changes: reply.rowCount ?? 0,
          lastInsertRowid: typeof id === 'number' ? id : Number(id ?? 0)
        }
      }
    }
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      client()({ op: 'exec', text: 'BEGIN' })
      try {
        const result = fn()
        client()({ op: 'exec', text: 'COMMIT' })
        return result
      } catch (error) {
        client()({ op: 'exec', text: 'ROLLBACK' })
        throw error
      }
    }
  }

  close(): void {
    /* The process owns the worker for its lifetime. */
  }
}
