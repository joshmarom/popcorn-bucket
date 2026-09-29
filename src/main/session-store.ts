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

const ENCRYPTED_PREFIX = 'enc:v1:'

function encodeSecret(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return value
  return ENCRYPTED_PREFIX + safeStorage.encryptString(value).toString('base64')
}

function decodeSecret(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value
  if (!safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

let cachedSession: AuthSession | null = null

export function getSessionToken(): string {
  return decodeSecret(store.get('sessionToken'))
}

export function setSession(token: string, session: AuthSession): void {
  store.set('sessionToken', encodeSecret(token))
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
