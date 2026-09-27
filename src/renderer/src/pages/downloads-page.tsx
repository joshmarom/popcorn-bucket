import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import type { WatchProgress } from '@shared/watch-history'
import { Download, FolderOpen, Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { formatBytes, formatSpeed, statusLabel } from '@/lib/torrent-download-format'
import { cn } from '@/lib/utils'
import { UntrackedDownloadsSection } from './untracked-downloads-section'

type DeleteTarget = { kind: 'one'; row: MovieTorrentDownloadSnapshot } | { kind: 'watched' }

function movieLabel(
  d: MovieTorrentDownloadSnapshot,
  fallbackTitles: Record<number, string>
): string {
  return d.movieTitle ?? fallbackTitles[d.movieId] ?? `Movie ${d.movieId}`
}

export function DownloadsPage(): ReactElement {
  const [downloads, setDownloads] = useState<MovieTorrentDownloadSnapshot[]>([])
  const [history, setHistory] = useState<Map<number, WatchProgress>>(new Map())
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [fallbackTitles, setFallbackTitles] = useState<Record<number, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [pauseBusyDownloadId, setPauseBusyDownloadId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadDownloads = useCallback(async (): Promise<void> => {
    const [rows, progress] = await Promise.all([
      window.api.torrent.getAllMovieDownloads(),
      window.api.history.list()
    ])
    setDownloads(rows)
    setHistory(new Map(progress.map((p) => [p.movieId, p])))
  }, [])

  useEffect(() => {
    void loadDownloads()
    return window.api.torrent.onDownloadsUpdate(setDownloads)
  }, [loadDownloads])

  // Downloads saved before titles were stored: look those titles up once.
  const untitledKey = useMemo(
    () =>
      [...new Set(downloads.filter((d) => d.movieTitle == null).map((d) => d.movieId))]
        .sort((a, b) => a - b)
        .join(','),
    [downloads]
  )
  useEffect(() => {
    if (!untitledKey) return
    let cancelled = false
    const ids = untitledKey.split(',').map(Number)
    void Promise.all(ids.map((id) => window.api.catalog.getMovie(id))).then((results) => {
      if (cancelled) return
      const next: Record<number, string> = {}
      results.forEach((res, i) => {
        if (res.ok) next[ids[i]!] = res.movie.title
      })
      setFallbackTitles((prev) => ({ ...prev, ...next }))
    })
    return (): void => {
      cancelled = true
    }
  }, [untitledKey])

  const active = downloads.filter((d) => d.status !== 'complete')
  const library = downloads.filter((d) => d.status === 'complete')
  const libraryBytes = library.reduce((n, d) => n + (d.totalBytes || 0), 0)
  const watched = library.filter((d) => history.get(d.movieId)?.finished)

  const refreshOnce = async (): Promise<void> => {
    setRefreshBusy(true)
    try {
      await loadDownloads()
    } finally {
      setRefreshBusy(false)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const rows = deleteTarget.kind === 'one' ? [deleteTarget.row] : watched
    setDeleteBusy(true)
    try {
      for (const row of rows) {
        const res = await window.api.torrent.removeMovieDownload(row.movieId, row.downloadId)
        if (!res.ok) setActionError(res.error)
      }
      setDeleteTarget(null)
      await loadDownloads()
    } finally {
      setDeleteBusy(false)
    }
  }

  const setDownloadPaused = async (
    movieId: number,
    downloadId: string,
    paused: boolean
  ): Promise<void> => {
    setPauseBusyDownloadId(downloadId)
    setActionError(null)
    try {
      const res = await window.api.torrent.setMovieDownloadPaused(movieId, downloadId, paused)
      if (!res.ok) setActionError(res.error)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not change pause state.')
    } finally {
      setPauseBusyDownloadId(null)
    }
  }

  const renderRow = (d: MovieTorrentDownloadSnapshot): ReactElement => {
    const progress = history.get(d.movieId)
    return (
      <Card key={d.downloadId} className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/movie/${d.movieId}`}
                className="truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {movieLabel(d, fallbackTitles)}
              </Link>
              <Badge
                variant={
                  d.status === 'error'
                    ? 'destructive'
                    : d.status === 'paused' || d.status === 'queued'
                      ? 'secondary'
                      : d.status === 'complete'
                        ? 'outline'
                        : 'default'
                }
              >
                {statusLabel(d.status)}
              </Badge>
              {d.status === 'complete' && progress?.finished ? (
                <Badge variant="secondary">Watched</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground truncate text-xs" title={d.displayTitle}>
              {d.displayTitle}
            </p>
            {d.status === 'error' && d.errorMessage ? (
              <p className="text-destructive text-xs">{d.errorMessage}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {d.status === 'downloading' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={pauseBusyDownloadId !== null}
                onClick={() => void setDownloadPaused(d.movieId, d.downloadId, true)}
              >
                <Pause className="size-3.5" />
                {pauseBusyDownloadId === d.downloadId ? '…' : 'Pause'}
              </Button>
            ) : null}
            {d.status === 'paused' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                disabled={pauseBusyDownloadId !== null}
                onClick={() => void setDownloadPaused(d.movieId, d.downloadId, false)}
              >
                <Play className="size-3.5" />
                {pauseBusyDownloadId === d.downloadId ? '…' : 'Resume'}
              </Button>
            ) : null}
            {d.status === 'complete' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => void window.api.app.showDownloadInFolder(d.downloadId)}
              >
                <FolderOpen className="size-3.5" />
                Show in folder
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={() => setDeleteTarget({ kind: 'one', row: d })}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
        {d.status === 'complete' ? (
          <p className="text-muted-foreground text-xs">
            {formatBytes(d.totalBytes)}
            {d.playFileLabel ? ` · ${d.playFileLabel}` : ''}
          </p>
        ) : (
          <>
            <div className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <span className="font-medium text-foreground">Swarm</span>: {d.numPeers} peers
              </div>
              <div>
                <span className="font-medium text-foreground">Speeds</span>: ↓{' '}
                {formatSpeed(d.downloadSpeed)} · ↑ {formatSpeed(d.uploadSpeed)}
              </div>
              <div>
                <span className="font-medium text-foreground">Progress</span>:{' '}
                {formatBytes(d.downloaded)} / {formatBytes(d.totalBytes)} (
                {Math.round((d.progress || 0) * 100)}%)
              </div>
            </div>
            {d.totalBytes > 0 && (
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-[width] duration-500"
                  style={{ width: `${Math.min(100, Math.round((d.progress || 0) * 100))}%` }}
                />
              </div>
            )}
          </>
        )}
      </Card>
    )
  }

  const deleteRows = deleteTarget?.kind === 'one' ? [deleteTarget.row] : watched

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">Downloads</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Finished movies stop sharing and play from your disk.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={refreshBusy}
          onClick={() => void refreshOnce()}
        >
          <RefreshCw className={cn('size-3.5', refreshBusy && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {actionError && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {actionError}
        </p>
      )}

      {downloads.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Download className="size-4 shrink-0 opacity-70" />
          Nothing here yet. Press Play on a movie to start one.
        </p>
      ) : null}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            In progress
          </h2>
          {active.map(renderRow)}
        </section>
      )}

      {library.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Library · {library.length} movie{library.length === 1 ? '' : 's'} ·{' '}
              {formatBytes(libraryBytes)}
            </h2>
            {watched.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => setDeleteTarget({ kind: 'watched' })}
              >
                <Trash2 className="size-3.5" />
                Remove {watched.length} watched
              </Button>
            )}
          </div>
          {library.map(renderRow)}
        </section>
      )}

      <UntrackedDownloadsSection onRecovered={() => void loadDownloads()} />

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null)
        }}
      >
        <DialogContent showCloseButton={!deleteBusy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteRows.length === 1 ? 'Delete download?' : `Delete ${deleteRows.length} movies?`}
            </DialogTitle>
            <DialogDescription>
              This deletes the downloaded files from disk
              {deleteRows.length > 0
                ? ` (${deleteRows.map((r) => movieLabel(r, fallbackTitles)).join(', ')})`
                : ''}
              . This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
