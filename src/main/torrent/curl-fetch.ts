import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CURL_BIN = process.platform === 'win32' ? 'curl.exe' : 'curl'

/** Hosts whose Cloudflare challenge blocks Node `fetch` but allows system curl. */
export function usesCurlForHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'apibay.org' ||
    host.endsWith('.apibay.org') ||
    host === 'limetorrents.lol' ||
    host.endsWith('.limetorrents.lol') ||
    host === 'limetorrents.fun' ||
    host.endsWith('.limetorrents.fun') ||
    host === 'uindex.org' ||
    host.endsWith('.uindex.org')
  )
}

/** Last HTTP block from `curl -D` (after redirects). */
export function parseCurlHeaderDump(raw: string): { status: number; headers: Headers } {
  const blocks = raw
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter((block) => /^HTTP\//i.test(block))
  const last = blocks.at(-1) ?? ''
  const lines = last.split(/\r?\n/)
  const statusMatch = /HTTP\/[\d.]+ (\d{3})/.exec(lines[0] ?? '')
  const headers = new Headers()
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const name = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (name) headers.append(name, value)
  }
  return { status: statusMatch ? Number(statusMatch[1]) : 0, headers }
}

function abortError(): Error {
  const error = new Error('Request timed out.')
  error.name = 'AbortError'
  return error
}

/**
 * HTTPS GET via `/usr/bin/curl`, returned as a Fetch `Response`.
 * Used where undici's TLS fingerprint is challenged (apibay, LimeTorrents, UIndex).
 */
export async function curlGet(url: string, init: RequestInit = {}): Promise<Response> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error(`curlGet only supports https (got ${parsed.protocol})`)
  }

  const signal = init.signal ?? undefined
  if (signal?.aborted) throw abortError()

  const requestHeaders = new Headers(init.headers)
  const dir = await mkdtemp(join(tmpdir(), 'pb-curl-'))
  const bodyPath = join(dir, 'body')
  const headerPath = join(dir, 'headers')

  const args = [
    '-sS',
    '-L',
    '--compressed',
    '--proto',
    '=https',
    '--proto-redir',
    '=https',
    '--connect-timeout',
    '8',
    '--max-time',
    '12',
    '-D',
    headerPath,
    '-o',
    bodyPath,
    '-w',
    '%{http_code}',
    '-A',
    requestHeaders.get('User-Agent') ??
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    '-H',
    `Accept: ${requestHeaders.get('Accept') ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'}`,
    parsed.href
  ]

  try {
    const { exitCode, stdout, stderr } = await runCurl(args, signal)
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `curl exited ${exitCode}`)
    }
    const httpCode = Number.parseInt(stdout.trim(), 10)
    const headerDump = await readFile(headerPath, 'utf8').catch(() => '')
    const parsedHeaders = parseCurlHeaderDump(headerDump)
    const status = Number.isInteger(httpCode) && httpCode > 0 ? httpCode : parsedHeaders.status || 502
    const body = await readFile(bodyPath).catch(() => Buffer.alloc(0))
    const headers = parsedHeaders.headers
    if (!headers.has('content-type') && body.length > 0 && body[0] === 0x5b) {
      headers.set('content-type', 'application/json')
    }
    return new Response(Uint8Array.from(body), { status, headers })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function runCurl(
  args: string[],
  signal: AbortSignal | undefined
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(CURL_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })

    const onAbort = (): void => {
      child.kill('SIGKILL')
    }
    if (signal) {
      if (signal.aborted) {
        child.kill('SIGKILL')
        reject(abortError())
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    child.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}
