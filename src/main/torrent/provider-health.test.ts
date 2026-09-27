import { beforeEach, describe, expect, it } from 'vitest'
import {
  FAILURES_BEFORE_SKIP,
  SKIP_MS,
  getProviderHealth,
  recordProviderFailure,
  recordProviderSuccess,
  resetProviderHealth,
  shouldQueryProvider
} from './provider-health'

describe('provider health', () => {
  beforeEach(() => resetProviderHealth())

  it('skips a provider after repeated failures and retries after the cooldown', () => {
    const t0 = 1_000_000
    for (let i = 0; i < FAILURES_BEFORE_SKIP; i++) recordProviderFailure('X', 'HTTP 403', 50, t0)
    expect(getProviderHealth(['X'])[0]!.state).toBe('skipped')
    expect(shouldQueryProvider('X', t0 + 1)).toBe(false)
    expect(shouldQueryProvider('X', t0 + SKIP_MS)).toBe(true)
  })

  it('a success clears the failure streak', () => {
    recordProviderFailure('Y', 'timeout', 12_000)
    recordProviderFailure('Y', 'timeout', 12_000)
    recordProviderSuccess('Y', 300, 42)
    const h = getProviderHealth(['Y'])[0]!
    expect(h).toMatchObject({ state: 'ok', consecutiveFailures: 0, lastResultCount: 42 })
  })
})
