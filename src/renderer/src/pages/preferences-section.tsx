import { useEffect, useState, type ReactElement } from 'react'
import type { Preferences } from '@shared/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const selectClass =
  'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring outline-none'

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange
}: {
  id: string
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}): ReactElement {
  return (
    <div className="space-y-2">
      <label className="type-label" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min)
        }}
      />
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  )
}

export function PreferencesSection(): ReactElement {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [defaultDir, setDefaultDir] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void window.api.prefs.get().then(setPrefs)
    void window.api.prefs.defaultDownloadDir().then(setDefaultDir)
  }, [])

  if (!prefs) return <p className="text-muted-foreground text-sm">Loading preferences…</p>

  const update = (patch: Partial<Preferences>): void => {
    setPrefs({ ...prefs, ...patch })
    setStatus(null)
  }

  const save = async (): Promise<void> => {
    const res = await window.api.prefs.set(prefs)
    if (res.ok) {
      setPrefs(res.prefs)
      setStatus('Saved.')
    } else {
      setStatus(res.error)
    }
  }

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.api.prefs.chooseDownloadDir()
    if (dir) update({ downloadDir: dir })
  }

  return (
    <section className="space-y-6 border-t border-border pt-8">
      <h2 className="type-section">Playback and downloads</h2>

      <div className="space-y-2">
        <label className="type-label" htmlFor="pref-resolution">
          Preferred quality
        </label>
        <select
          id="pref-resolution"
          className={selectClass}
          value={prefs.preferredResolution}
          onChange={(e) =>
            update({ preferredResolution: e.target.value as Preferences['preferredResolution'] })
          }
        >
          <option value="2160p">4K (2160p)</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
        </select>
        <p className="text-muted-foreground text-xs">Play picks the closest match to this.</p>
      </div>

      <div className="space-y-2">
        <span className="type-label">Download folder</span>
        <div className="flex items-center gap-2">
          <p className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
            {prefs.downloadDir || defaultDir}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void chooseFolder()}>
            Change…
          </Button>
          {prefs.downloadDir ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update({ downloadDir: '' })}
            >
              Reset
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Applies to new downloads; existing ones stay where they are.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="pref-max-active"
          label="Downloads at once"
          hint="Others wait as Queued."
          value={prefs.maxActiveDownloads}
          min={1}
          max={10}
          onChange={(n) => update({ maxActiveDownloads: n })}
        />
        <NumberField
          id="pref-down-limit"
          label="Download limit (KB/s)"
          hint="0 means unlimited."
          value={prefs.downloadLimitKBps}
          min={0}
          max={1_000_000}
          onChange={(n) => update({ downloadLimitKBps: n })}
        />
        <NumberField
          id="pref-up-limit"
          label="Upload limit (KB/s)"
          hint="While downloading only."
          value={prefs.uploadLimitKBps}
          min={0}
          max={1_000_000}
          onChange={(n) => update({ uploadLimitKBps: n })}
        />
      </div>

      <div className="space-y-2">
        <label className="type-label" htmlFor="pref-sub-lang">
          Subtitle language
        </label>
        <select
          id="pref-sub-lang"
          className={selectClass}
          value={prefs.subtitleLanguage}
          onChange={(e) => update({ subtitleLanguage: e.target.value })}
        >
          <option value="">Don&apos;t look up subtitles</option>
          {[
            ['en', 'English'],
            ['es', 'Spanish'],
            ['fr', 'French'],
            ['de', 'German'],
            ['it', 'Italian'],
            ['pt', 'Portuguese'],
            ['he', 'Hebrew'],
            ['ar', 'Arabic'],
            ['ru', 'Russian'],
            ['ja', 'Japanese'],
            ['ko', 'Korean'],
            ['zh', 'Chinese']
          ].map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Downloaded from OpenSubtitles when the torrent has none in this language (needs an
          OpenSubtitles API key above).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()}>
          Save preferences
        </Button>
        {status ? <span className="text-muted-foreground text-sm">{status}</span> : null}
      </div>
    </section>
  )
}
