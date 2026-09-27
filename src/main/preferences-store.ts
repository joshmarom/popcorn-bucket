import * as ElectronStoreModule from 'electron-store'
import { EventEmitter } from 'node:events'
import { z } from 'zod'
import { defaultPreferences, type Preferences } from '@shared/preferences'

type StoreCtor = typeof import('electron-store').default

function getStoreConstructor(): StoreCtor {
  const exported = (ElectronStoreModule as { default?: unknown }).default
  if (typeof exported === 'function') return exported as StoreCtor
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

export const preferencesSchema = z.object({
  preferredResolution: z.enum(['2160p', '1080p', '720p', '480p']),
  downloadDir: z.string().max(1000),
  maxActiveDownloads: z.number().int().min(1).max(10),
  downloadLimitKBps: z.number().int().min(0).max(1_000_000),
  uploadLimitKBps: z.number().int().min(0).max(1_000_000),
  subtitleLanguage: z.string().regex(/^([a-z]{2})?$/)
})

const store = new (getStoreConstructor())({
  name: 'popcorn-bucket-preferences',
  defaults: defaultPreferences
})

/** Emits `change` (Preferences) after every successful update. */
export const preferenceEvents = new EventEmitter()

export function getPreferences(): Preferences {
  const parsed = preferencesSchema.safeParse({ ...defaultPreferences, ...store.store })
  return parsed.success ? parsed.data : defaultPreferences
}

export function setPreferences(partial: Partial<Preferences>): Preferences {
  const next = preferencesSchema.parse({ ...getPreferences(), ...partial })
  store.set(next)
  preferenceEvents.emit('change', next)
  return next
}
