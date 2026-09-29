import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NETWORK_NOTICE_TEXT } from '@/lib/network-notice'
import { PreferencesSection } from './preferences-section'
import type { AuthStatus } from '@shared/auth'

export function SettingsPage(): ReactElement {
  const [status, setStatus] = useState<AuthStatus | null>(null)

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

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Catalog, search, and your lists live on the Popcorn Bucket server. Playback and downloads
          stay on this computer.
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
        <p className="text-muted-foreground text-sm">You are signed out.</p>
      )}
      <PreferencesSection />
      <section className="space-y-2 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Network</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">{NETWORK_NOTICE_TEXT}</p>
      </section>
    </div>
  )
}

export function SignInGate({ children }: { children: ReactElement }): ReactElement {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.auth.status().then(setStatus)
    return window.api.auth.onChange(setStatus)
  }, [])

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
    setStatus({ signedIn: true, email: result.email, name: result.name, role: result.role })
  }

  if (status == null) {
    return (
      <div className="bg-background flex h-screen items-center justify-center text-sm text-muted-foreground">
        Connecting…
      </div>
    )
  }

  if (!status.signedIn) {
    return (
      <div className="bg-background flex h-screen items-center justify-center px-4">
        <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Use your Popcorn Bucket account to load catalog, lists, and torrent search from the
            server.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sign-in-email">
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
            <label className="text-sm font-medium" htmlFor="sign-in-password">
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
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    )
  }

  return children
}
