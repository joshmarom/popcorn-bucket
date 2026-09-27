import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NETWORK_NOTICE_TEXT } from '@/lib/network-notice'

export function SettingsPage(): ReactElement {
  const [settingsKey, setSettingsKey] = useState('')
  const [settingsToken, setSettingsToken] = useState('')
  const [omdbKey, setOmdbKey] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)

  const loadSettings = useCallback(async (): Promise<void> => {
    const s = await window.api.settings.get()
    setSettingsKey(s.tmdbApiKey)
    setSettingsToken(s.tmdbReadAccessToken)
    setOmdbKey(s.omdbApiKey)
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const saveSettings = async (): Promise<void> => {
    await window.api.settings.set({
      tmdbApiKey: settingsKey,
      tmdbReadAccessToken: settingsToken,
      omdbApiKey: omdbKey
    })
    setSettingsSaved(true)
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API credentials</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Paste your <strong className="text-foreground">API Read Access Token</strong>{' '}
          (recommended) and/or your <strong className="text-foreground">API Key (v3)</strong> from{' '}
          <a
            href="https://www.themoviedb.org/settings/api"
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium underline underline-offset-4"
          >
            themoviedb.org/settings/api
          </a>
          . Keys are stored locally on this machine only.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="tmdb-token">
          Read Access Token (Bearer)
        </label>
        <Textarea
          id="tmdb-token"
          rows={4}
          value={settingsToken}
          onChange={(e) => setSettingsToken(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiJ9…"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="tmdb-key">
          API Key (v3)
        </label>
        <Input
          id="tmdb-key"
          value={settingsKey}
          onChange={(e) => setSettingsKey(e.target.value)}
          placeholder="32-character v3 key"
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="omdb-key">
          OMDb API key (optional)
        </label>
        <Input
          id="omdb-key"
          value={omdbKey}
          onChange={(e) => setOmdbKey(e.target.value)}
          placeholder="Fills missing metadata from OMDb when needed"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          When TMDB is missing a poster, plot, year, runtime, rating, genres, or cast, the app
          resolves the IMDb id and merges what OMDb returns. Leave empty to skip. Env:{' '}
          <code className="bg-muted rounded px-1 py-0.5">OMDB_API_KEY</code>.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void saveSettings()}>
          Save
        </Button>
        {settingsSaved && <span className="text-muted-foreground text-sm">Saved.</span>}
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Alternatively, set{' '}
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
          TMDB_READ_ACCESS_TOKEN
        </code>{' '}
        and <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">TMDB_API_KEY</code>{' '}
        in the environment before launch; they are used only when a field here is left empty.
      </p>
      <section className="space-y-2 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Network</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">{NETWORK_NOTICE_TEXT}</p>
      </section>
    </div>
  )
}
