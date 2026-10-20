import type { ReleaseResolution } from './release-info'

export type PlayerPreference = 'mpv' | 'inline' | 'inline-only' | 'mpv-only'

export type Preferences = {
  preferredResolution: ReleaseResolution
  /** Controls when to use the in-app Vidstack player vs external mpv. */
  preferredPlayer: PlayerPreference
  /** Absolute folder for new downloads; empty means `Downloads/Popcorn Bucket`. */
  downloadDir: string
  /** Downloads that run at once; the rest wait as "Queued". */
  maxActiveDownloads: number
  /** KB/s; 0 means unlimited. */
  downloadLimitKBps: number
  /** KB/s while downloading; 0 means unlimited. Finished downloads never upload. */
  uploadLimitKBps: number
  /** ISO 639-1 code for subtitle lookup, e.g. `en`; empty disables lookup. */
  subtitleLanguage: string
}

export const defaultPreferences: Preferences = {
  preferredResolution: '1080p',
  preferredPlayer: 'inline',
  downloadDir: '',
  maxActiveDownloads: 2,
  downloadLimitKBps: 0,
  uploadLimitKBps: 0,
  subtitleLanguage: 'en'
}
