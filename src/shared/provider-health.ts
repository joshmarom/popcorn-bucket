export type ProviderHealth = {
  provider: string
  /** `skipped` while cooling down after repeated failures. */
  state: 'ok' | 'failing' | 'skipped'
  consecutiveFailures: number
  lastError: string | null
  lastLatencyMs: number | null
  lastResultCount: number | null
  /** Epoch ms when a skipped provider is tried again. */
  retryAt: number | null
}
