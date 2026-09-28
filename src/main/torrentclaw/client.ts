import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { z } from 'zod'
import type { TorrentClawKeyStatus } from '@shared/app-settings'

export const TORRENTCLAW_ORIGIN = 'https://torrentclaw.com'
const API_BASE = `${TORRENTCLAW_ORIGIN}/api/v1`
const DEFAULT_TIMEOUT_MS = 12_000
/** Used when a 429 carries no usable `Retry-After`. */
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000

/**
 * - `prefer`: send the key when one is usable, otherwise (or if it is rejected) go anonymous.
 * - `require`: only useful with a key (magnets are stripped for anonymous callers).
 * - `none`: always anonymous.
 */
export type TorrentClawAuthMode = 'prefer' | 'require' | 'none'

export type TorrentClawErrorCode =
  | 'NO_KEY'
  | 'KEY_REJECTED'
  | 'RATE_LIMITED'
  | 'HTTP'
  | 'BAD_RESPONSE'

export class TorrentClawError extends Error {
  constructor(
    readonly code: TorrentClawErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'TorrentClawError'
  }
}

let rateLimitedUntil = 0
/** The key TorrentClaw last refused; skipped until the user saves a different one. */
let rejectedKey: string | null = null

let readApiKey: () => string = () => ''

/** Wires the client to the settings store (kept out of this module so tests need no Electron). */
export function configureTorrentClaw(opts: { getApiKey: () => string }): void {
  readApiKey = opts.getApiKey
}

function configuredKey(): string {
  return readApiKey().trim()
}

function usableKey(): string | null {
  const key = configuredKey()
  if (!key || key === rejectedKey) return null
  return key
}

export function hasUsableTorrentClawKey(): boolean {
  return usableKey() !== null
}

export function getTorrentClawKeyStatus(): TorrentClawKeyStatus {
  const key = configuredKey()
  if (!key) return 'anonymous'
  return key === rejectedKey ? 'rejected' : 'active'
}

function userAgent(): string {
  return `PopcornBucket/${app.getVersion()}`
}

function cacheDir(): string {
  return join(app.getPath('userData'), 'torrentclaw-cache')
}

function cacheKey(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

async function readCache(key: string): Promise<unknown> {
  try {
    const raw = await readFile(join(cacheDir(), `${key}.json`), 'utf8')
    const parsed = JSON.parse(raw) as { exp: number; data: unknown }
    return parsed.exp >= Date.now() ? parsed.data : undefined
  } catch {
    return undefined
  }
}

async function writeCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true })
    await writeFile(
      join(cacheDir(), `${key}.json`),
      JSON.stringify({ exp: Date.now() + ttlMs, data }),
      'utf8'
    )
  } catch {
    /* cache is best-effort */
  }
}

function parseRetryAfterMs(raw: string | null): number {
  if (!raw) return DEFAULT_RATE_LIMIT_COOLDOWN_MS
  const secs = Number(raw)
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 15 * 60_000)
  const at = Date.parse(raw)
  if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 15 * 60_000))
  return DEFAULT_RATE_LIMIT_COOLDOWN_MS
}

function isAnonymousNotice(json: unknown): boolean {
  if (!json || typeof json !== 'object' || !('_notice' in json)) return false
  const notice = (json as { _notice: unknown })._notice
  return typeof notice === 'string' && /api key/i.test(notice)
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): URL {
  const u = new URL(`${API_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    u.searchParams.set(k, String(v))
  }
  return u
}

async function request(url: URL, key: string | null, signal: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': userAgent()
  }
  if (key) headers.Authorization = `Bearer ${key}`
  return fetch(url, { headers, signal })
}

export type TcFetchOptions<S extends z.ZodTypeAny> = {
  schema: S
  auth?: TorrentClawAuthMode
  /** Disk cache lifetime; omit to skip the cache. */
  ttlMs?: number
  signal?: AbortSignal
  timeoutMs?: number
}

export async function tcFetchJson<S extends z.ZodTypeAny>(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: TcFetchOptions<S>
): Promise<z.infer<S>> {
  const auth = opts.auth ?? 'prefer'
  let key = auth === 'none' ? null : usableKey()
  if (auth === 'require' && !key) {
    throw new TorrentClawError('NO_KEY', 'No TorrentClaw API key configured.')
  }
  if (Date.now() < rateLimitedUntil) {
    throw new TorrentClawError('RATE_LIMITED', 'TorrentClaw rate limit; retrying later.', 429)
  }

  const url = buildUrl(path, params)
  const ck = opts.ttlMs ? cacheKey(['v1', url.toString(), key !== null]) : null
  if (ck) {
    const hit = await readCache(ck)
    if (hit !== undefined) {
      const parsed = opts.schema.safeParse(hit)
      if (parsed.success) return parsed.data
    }
  }

  const ac = new AbortController()
  const onAbort = (): void => ac.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    let res = await request(url, key, ac.signal)
    if (key && (res.status === 401 || res.status === 403)) {
      const keyedStatus = res.status
      res = await request(url, null, ac.signal)
      // Only blame the key if the same request works without it (a 403 can also be Cloudflare).
      if (res.ok) {
        rejectedKey = key
        if (auth === 'require') {
          throw new TorrentClawError(
            'KEY_REJECTED',
            'TorrentClaw rejected the API key.',
            keyedStatus
          )
        }
      }
      key = null
    }

    if (res.status === 429) {
      rateLimitedUntil = Date.now() + parseRetryAfterMs(res.headers.get('Retry-After'))
      throw new TorrentClawError('RATE_LIMITED', 'TorrentClaw rate limit; retrying later.', 429)
    }
    if (!res.ok) {
      throw new TorrentClawError('HTTP', `TorrentClaw HTTP ${res.status}`, res.status)
    }

    const json: unknown = await res.json()
    // An unknown key is not refused outright: TorrentClaw answers as if anonymous and adds a notice.
    if (key && isAnonymousNotice(json)) {
      rejectedKey = key
      if (auth === 'require') {
        throw new TorrentClawError('KEY_REJECTED', 'TorrentClaw rejected the API key.', res.status)
      }
      key = null
    }
    const parsed = opts.schema.safeParse(json)
    if (!parsed.success) {
      throw new TorrentClawError('BAD_RESPONSE', 'Unexpected response from TorrentClaw.')
    }
    if (opts.ttlMs) {
      await writeCache(cacheKey(['v1', url.toString(), key !== null]), json, opts.ttlMs)
    }
    return parsed.data
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
