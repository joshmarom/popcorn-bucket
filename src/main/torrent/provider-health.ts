import type { ProviderHealth } from '@shared/provider-health'

/** After this many failures in a row a provider is skipped for a while. */
export const FAILURES_BEFORE_SKIP = 3
export const SKIP_MS = 10 * 60 * 1000

const health = new Map<string, ProviderHealth>()

function entry(provider: string): ProviderHealth {
  let h = health.get(provider)
  if (!h) {
    h = {
      provider,
      state: 'ok',
      consecutiveFailures: 0,
      lastError: null,
      lastLatencyMs: null,
      lastResultCount: null,
      retryAt: null
    }
    health.set(provider, h)
  }
  return h
}

/** True when the provider should be queried now (not cooling down). */
export function shouldQueryProvider(provider: string, now = Date.now()): boolean {
  const h = entry(provider)
  if (h.state !== 'skipped') return true
  if (h.retryAt != null && now >= h.retryAt) {
    h.state = 'failing'
    return true
  }
  return false
}

export function recordProviderSuccess(provider: string, latencyMs: number, count: number): void {
  const h = entry(provider)
  h.state = 'ok'
  h.consecutiveFailures = 0
  h.lastError = null
  h.lastLatencyMs = latencyMs
  h.lastResultCount = count
  h.retryAt = null
}

export function recordProviderFailure(
  provider: string,
  error: string,
  latencyMs: number,
  now = Date.now()
): void {
  const h = entry(provider)
  h.consecutiveFailures += 1
  h.lastError = error
  h.lastLatencyMs = latencyMs
  h.lastResultCount = null
  if (h.consecutiveFailures >= FAILURES_BEFORE_SKIP) {
    h.state = 'skipped'
    h.retryAt = now + SKIP_MS
  } else {
    h.state = 'failing'
  }
}

export function getProviderHealth(providers: string[]): ProviderHealth[] {
  return providers.map((p) => ({ ...entry(p) }))
}

export function resetProviderHealth(): void {
  health.clear()
}
