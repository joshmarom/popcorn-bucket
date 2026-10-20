import * as ElectronStoreModule from 'electron-store'
import { safeStorage } from 'electron'
import type { AuthSession } from '@shared/auth'

type StoreCtor = typeof import('electron-store').default

function getStoreConstructor(): StoreCtor {
  const exported = (ElectronStoreModule as { default?: unknown }).default
  if (typeof exported === 'function') {
    return exported as StoreCtor
  }
  if (
    exported !== null &&
    typeof exported === 'object' &&
    'default' in exported &&
    typeof (exported as { default: unknown }).default === 'function'
  ) {
    return (exported as { default: StoreCtor }).default
  }
  throw new Error('Could not load electron-store constructor.')
}

const store = new (getStoreConstructor())({
  name: 'popcorn-bucket-session',
  defaults: { sessionToken: '', email: '', name: '', role: '' }
})

/** Session tokens written by the old `safeStorage` path. New tokens are stored as plaintext. */
const ENCRYPTED_PREFIX = 'enc:v1:'

function readToken(): string {
  const raw = store.get('sessionToken') as unknown
  if (typeof raw !== 'string') return ''
  if (!raw.startsWith(ENCRYPTED_PREFIX)) return raw
  if (!safeStorage.isEncryptionAvailable()) return ''
  try {
    const plain = safeStorage.decryptString(
      Buffer.from(raw.slice(ENCRYPTED_PREFIX.length), 'base64')
    )
    store.set('sessionToken', plain)
    return plain
  } catch {
    return ''
  }
}

let cachedSession: AuthSession | null = null

export function getSessionToken(): string {
  return readToken()
}

/** Rewrite a leftover keychain-encrypted token as plaintext. Call after app ready. */
export function migrateStoredSession(): void {
  readToken()
}

export function setSession(token: string, session: AuthSession): void {
  store.set('sessionToken', token)
  store.set('email', session.email)
  store.set('name', session.name)
  store.set('role', session.role)
  cachedSession = session
}

export function getCachedSession(): AuthSession | null {
  if (cachedSession) return cachedSession
  const email = typeof store.get('email') === 'string' ? store.get('email') : ''
  const name = typeof store.get('name') === 'string' ? store.get('name') : ''
  const role = typeof store.get('role') === 'string' ? store.get('role') : ''
  if (!email || !getSessionToken()) return null
  cachedSession = { email, name, role }
  return cachedSession
}

export function clearSession(): void {
  store.set('sessionToken', '')
  store.set('email', '')
  store.set('name', '')
  store.set('role', '')
  cachedSession = null
}
