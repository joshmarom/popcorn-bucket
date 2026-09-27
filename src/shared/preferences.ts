import type { ReleaseResolution } from './release-info'

export type Preferences = {
  preferredResolution: ReleaseResolution
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
  downloadDir: '',
  maxActiveDownloads: 2,
  downloadLimitKBps: 0,
  uploadLimitKBps: 0,
  subtitleLanguage: 'en'
}
