import { BrowserWindow } from 'electron'
import type { AuthStatus } from '@shared/auth'
import { clearSession, getCachedSession, getSessionToken } from './session-store'

export const API_ORIGIN = (process.env.POPCORN_API_URL ?? 'https://popcorn.josh.co.il').replace(
  /\/$/,
  ''
)

export function authStatus(): AuthStatus {
  const session = getCachedSession()
  if (!session || !getSessionToken()) return { signedIn: false }
  return { signedIn: true, ...session }
}

export function broadcastAuthStatus(): void {
  const status = authStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('auth:changed', status)
  }
}

export async function apiJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init
  const token = getSessionToken()
  const headers = new Headers(rest.headers)
  headers.set('accept', 'application/json')
  headers.set('origin', API_ORIGIN)
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`)
  }
  if (rest.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      ...rest,
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error.'
    return { ok: false, error: message, code: 'NETWORK' } as T
  }
  const data = (await response.json().catch(() => null)) as T | null
  if (response.status === 401) {
    clearSession()
    broadcastAuthStatus()
    return (data ?? { ok: false, error: 'Sign in required.' }) as T
  }
  if (data == null) {
    return { ok: false, error: 'Unexpected response from the server.', code: 'NETWORK' } as T
  }
  return data
}

export async function apiSignIn(
  email: string,
  password: string
): Promise<{ token: string } | { error: string }> {
  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: API_ORIGIN
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not reach the server.' }
  }
  const token = response.headers.get('set-auth-token')?.trim() ?? ''
  const body = (await response.json().catch(() => null)) as {
    message?: string
    token?: string
  } | null
  if (!response.ok || !token) {
    return { error: body?.message || 'Sign in failed.' }
  }
  return { token }
}
