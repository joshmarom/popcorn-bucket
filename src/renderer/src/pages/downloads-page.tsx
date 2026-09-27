import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { Download, Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
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

export function DownloadsPage(): ReactElement {
  const [downloads, setDownloads] = useState<MovieTorrentDownloadSnapshot[]>([])
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [movieTitles, setMovieTitles] = useState<Record<number, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [pauseBusyDownloadId, setPauseBusyDownloadId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadDownloads = useCallback(async (): Promise<void> => {
    const rows = await window.api.torrent.getAllMovieDownloads()
    setDownloads(rows)
  }, [])

  useEffect(() => {
    void loadDownloads()
    const interval = setInterval(() => {
      void loadDownloads()
    }, 1000)
    return (): void => {
      clearInterval(interval)
    }
  }, [loadDownloads])

  const movieIdsKey = useMemo(
    () => [...new Set(downloads.map((d) => d.movieId))].sort((a, b) => a - b).join(','),
    [downloads]
  )

  useEffect(() => {
    if (movieIdsKey.length === 0) return
    const ids = movieIdsKey.split(',').map((s) => Number.parseInt(s, 10))
    let cancelled = false
    void (async (): Promise<void> => {
      const batch: Record<number, string> = {}
      for (const mid of ids) {
        if (!Number.isFinite(mid) || mid < 1) continue
        const res = await window.api.catalog.getMovie(mid)
        if (cancelled) return
        batch[mid] = res.ok ? res.movie.title : `Movie ${mid}`
      }
      if (!cancelled) {
        setMovieTitles((prev) => {
          const merged = { ...prev }
          for (const [k, v] of Object.entries(batch)) {
            merged[Number(k)] = v
          }
          return merged
        })
      }
    })()
    return (): void => {
      cancelled = true
    }
  }, [movieIdsKey])

  const refreshOnce = useCallback(async (): Promise<void> => {
    setRefreshBusy(true)
    try {
      await loadDownloads()
    } finally {
      setRefreshBusy(false)
    }
  }, [loadDownloads])

  const removeDownload = useCallback(
    async (movieId: number, downloadId: string): Promise<boolean> => {
      const res = await window.api.torrent.removeMovieDownload(movieId, downloadId)
      if (!res.ok) {
        setActionError(res.error)
        return false
      }
      void loadDownloads()
      return true
    },
    [loadDownloads]
  )

  const confirmRemoveDownload = useCallback(async (): Promise<void> => {
    const row = downloads.find((d) => d.downloadId === deleteConfirmId)
    if (row == null) return
    setDeleteBusy(true)
    try {
      if (await removeDownload(row.movieId, row.downloadId)) setDeleteConfirmId(null)
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteConfirmId, downloads, removeDownload])

  const setDownloadPaused = useCallback(
    async (movieId: number, downloadId: string, paused: boolean): Promise<void> => {
      setPauseBusyDownloadId(downloadId)
      setActionError(null)
      try {
        const res = await window.api.torrent.setMovieDownloadPaused(movieId, downloadId, paused)
        if (!res.ok) setActionError(res.error)
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Could not change pause state.')
      } finally {
        setPauseBusyDownloadId(null)
        void loadDownloads()
      }
    },
    [loadDownloads]
  )

  const deleteTarget = deleteConfirmId
    ? downloads.find((d) => d.downloadId === deleteConfirmId)
    : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">Downloads</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Torrent downloads across all movies, including finished ones, until you delete them.
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
          No downloads yet. Queue a torrent from a movie&apos;s Sources tab.
        </p>
      ) : (
        <div className="space-y-3">
          {downloads.map((d) => (
            <Card key={d.downloadId} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-medium">{d.displayTitle}</h2>
                    <Badge
                      variant={
                        d.status === 'error'
                          ? 'destructive'
                          : d.status === 'paused'
                            ? 'secondary'
                            : d.status === 'complete'
                              ? 'outline'
                              : 'default'
                      }
                    >
                      {statusLabel(d.status)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    <Link
                      to={`/movie/${d.movieId}`}
                      className="text-foreground font-medium underline-offset-4 hover:underline"
                    >
                      {movieTitles[d.movieId] ?? `Movie ${d.movieId}`}
                    </Link>
                    {d.torrentName ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · <span className="text-foreground/90">{d.torrentName}</span>
                      </span>
                    ) : null}
                  </p>
                  {d.status === 'error' && d.errorMessage ? (
                    <p className="text-destructive text-xs">{d.errorMessage}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1" asChild>
                    <Link to={`/movie/${d.movieId}`}>View movie</Link>
                  </Button>
                  {d.status === 'downloading' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      disabled={pauseBusyDownloadId !== null}
                      title="Pause downloading (can resume later)"
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
                      title="Resume downloading"
                      onClick={() => void setDownloadPaused(d.movieId, d.downloadId, false)}
                    >
                      <Play className="size-3.5" />
                      {pauseBusyDownloadId === d.downloadId ? '…' : 'Resume'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    title="Delete this download and its data"
                    onClick={() => setDeleteConfirmId(d.downloadId)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
              <div className="text-muted-foreground grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="font-medium text-foreground">Indexer</span>: S {d.indexerSeeders}{' '}
                  · L {d.indexerLeechers}
                </div>
                <div>
                  <span className="font-medium text-foreground">Swarm</span>: {d.numPeers} peers
                </div>
                <div>
                  <span className="font-medium text-foreground">Speeds</span>: ↓{' '}
                  {formatSpeed(d.downloadSpeed)} · ↑ {formatSpeed(d.uploadSpeed)}
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <span className="font-medium text-foreground">Progress</span>:{' '}
                  {formatBytes(d.downloaded)} / {formatBytes(d.totalBytes)} (
                  {Math.round((d.progress || 0) * 100)}%)
                  {d.playFileLabel ? (
                    <span className="ml-1">
                      · playing <span className="text-foreground">{d.playFileLabel}</span>
                    </span>
                  ) : null}
                </div>
              </div>
              {d.totalBytes > 0 && (
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((d.progress || 0) * 100))}%`
                    }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={deleteConfirmId != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteConfirmId(null)
        }}
      >
        <DialogContent showCloseButton={!deleteBusy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete download?</DialogTitle>
            <DialogDescription>
              This removes the torrent from Popcorn Bucket and deletes downloaded data from disk.
              {deleteTarget ? (
                <>
                  {' '}
                  <span className="font-medium text-foreground">{deleteTarget.displayTitle}</span> (
                  <span className="font-medium text-foreground">
                    {movieTitles[deleteTarget.movieId] ?? `Movie ${deleteTarget.movieId}`}
                  </span>
                  ).{' '}
                </>
              ) : null}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void confirmRemoveDownload()}
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
