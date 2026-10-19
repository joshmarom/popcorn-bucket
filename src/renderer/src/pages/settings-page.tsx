import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NETWORK_NOTICE_TEXT } from '@/lib/network-notice'
import { PreferencesSection } from './preferences-section'
import type { AuthStatus } from '@shared/auth'

export function SettingsPage(): ReactElement {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setStatus(await window.api.auth.status())
  }, [])

  useEffect(() => {
    void load()
    return window.api.auth.onChange(setStatus)
  }, [load])

  const signOut = async (): Promise<void> => {
    setStatus(await window.api.auth.signOut())
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result = await window.api.auth.signIn(email, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPassword('')
    setStatus({ signedIn: true, email: result.email, name: result.name, role: result.role })
  }

  return (
    <div className="mx-auto max-w-md space-y-8 px-4 py-8 pb-16">
      <div>
        <h1 className="type-page">Account</h1>
        <p className="type-prose text-muted-foreground mt-2">
          Catalog, search, and playback work without an account. Sign in to use your account’s lists
          and watch history. Without an account, they stay on this computer.
        </p>
      </div>
      {status?.signedIn ? (
        <div className="space-y-3">
          <p className="text-sm">
            Signed in as <span className="font-medium">{status.email}</span>
          </p>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-2">
            <label className="type-label" htmlFor="sign-in-email">
              Email
            </label>
            <Input
              id="sign-in-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="type-label" htmlFor="sign-in-password">
              Password
            </label>
            <Input
              id="sign-in-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" disabled={busy || status == null}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      )}
      <PreferencesSection />
      <section className="space-y-4 border-t border-border pt-8">
        <h2 className="type-section">Network</h2>
        <p className="type-prose text-muted-foreground">{NETWORK_NOTICE_TEXT}</p>
      </section>
    </div>
  )
}
