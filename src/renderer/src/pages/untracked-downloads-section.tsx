import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { UntrackedDownload } from '@shared/torrent-downloads'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/torrent-download-format'

/** Movie files on disk that the download list lost track of; offer to re-add or delete them. */
export function UntrackedDownloadsSection({
  onRecovered
}: {
  onRecovered: () => void
}): ReactElement | null {
  const [items, setItems] = useState<UntrackedDownload[]>([])
  const [titles, setTitles] = useState<Record<number, string>>({})
  const [busyDir, setBusyDir] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async (): Promise<void> => {
    const found = await window.api.torrent.scanUntracked()
    setItems(found)
    const ids = [...new Set(found.map((f) => f.movieId))]
    const results = await Promise.all(ids.map((id) => window.api.catalog.getMovie(id)))
    const next: Record<number, string> = {}
    results.forEach((res, i) => {
      if (res.ok) next[ids[i]!] = res.movie.title
    })
    setTitles(next)
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  if (items.length === 0) return null
  const total = items.reduce((n, i) => n + i.bytes, 0)

  const act = async (
    item: UntrackedDownload,
    run: () => Promise<{ ok: true } | { ok: false; error: string }>
  ): Promise<void> => {
    setBusyDir(item.dir)
    setError(null)
    try {
      const res = await run()
      if (!res.ok) setError(res.error)
      await scan()
      onRecovered()
    } finally {
      setBusyDir(null)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Found on disk · {items.length} · {formatBytes(total)}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          These movies are in your download folder but not in the list (earlier versions could lose
          the list when quitting). Add them back to play them, or delete them to free space.
        </p>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {items.map((item) => (
        <Card key={item.dir} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {titles[item.movieId] ?? `Movie ${item.movieId}`}
            </p>
            <p className="text-muted-foreground truncate text-xs" title={item.videoPath}>
              {item.videoPath.split(/[\\/]/).pop()} · {formatBytes(item.bytes)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={busyDir != null}
              onClick={() =>
                void act(item, () =>
                  window.api.torrent.recoverUntracked(item.dir, titles[item.movieId] ?? '')
                )
              }
            >
              Add to library
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={busyDir != null}
              onClick={() => {
                if (window.confirm('Delete these files from disk? This cannot be undone.')) {
                  void act(item, () => window.api.torrent.deleteUntracked(item.dir))
                }
              }}
            >
              Delete files
            </Button>
          </div>
        </Card>
      ))}
    </section>
  )
}
