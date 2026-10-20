import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads'
import type { LibraryDb } from '../../src/main/library/db'
import { toPostgres } from '../../src/main/library/sql-dialect'

type Reply = { id: number; rows?: Record<string, unknown>[]; rowCount?: number; error?: string }

/**
 * better-sqlite3 shaped client. Calls block the thread so the existing library
 * code can keep its synchronous API while the rows live in Postgres.
 */
export function openPgLibrary(connectionString: string): LibraryDb {
  const sab = new SharedArrayBuffer(4)
  const lock = new Int32Array(sab)
  const { port1, port2 } = new MessageChannel()
  const worker = new Worker(new URL('./pg-worker.js', import.meta.url), {
    workerData: { connectionString }
  })
  worker.postMessage({ type: 'init', port: port2, sab }, [port2])

  let seq = 0
  const call = (body: { op: 'query'; text: string; params: unknown[] } | { op: 'exec'; text: string }): Reply => {
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

  const prepare = (
    sql: string
  ): {
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown[]
    run: (...args: unknown[]) => { changes: number; lastInsertRowid: number }
  } => ({
    get: (...args: unknown[]): unknown => {
      const bound = toPostgres(sql, args)
      const reply = call({ op: 'query', text: bound.text, params: bound.params })
      return reply.rows?.[0]
    },
    all: (...args: unknown[]): unknown[] => {
      const bound = toPostgres(sql, args)
      const reply = call({ op: 'query', text: bound.text, params: bound.params })
      return reply.rows ?? []
    },
    run: (...args: unknown[]): { changes: number; lastInsertRowid: number } => {
      let text = sql
      const returningId = /^insert\s+into\s+lists\b/i.test(text) && !/returning/i.test(text)
      if (returningId) text = `${text.trimEnd()} RETURNING id`
      const bound = toPostgres(text, args)
      const reply = call({ op: 'query', text: bound.text, params: bound.params })
      const id = reply.rows?.[0]?.id
      return {
        changes: reply.rowCount ?? 0,
        lastInsertRowid: typeof id === 'number' ? id : Number(id ?? 0)
      }
    }
  })

  const db = {
    prepare,
    exec: (text: string): void => {
      for (const statement of text
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)) {
        call({ op: 'exec', text: statement })
      }
    },
    transaction: <T>(fn: () => T): (() => T) => {
      return () => {
        call({ op: 'exec', text: 'BEGIN' })
        try {
          const result = fn()
          call({ op: 'exec', text: 'COMMIT' })
          return result
        } catch (error) {
          call({ op: 'exec', text: 'ROLLBACK' })
          throw error
        }
      }
    },
    close: (): void => {
      void worker.terminate()
    }
  }
  return db as unknown as LibraryDb
}
