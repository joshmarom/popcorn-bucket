import type { TorrentSearchResponse, TorrentSource } from '@shared/torrent'
import type { RankedSources } from '@shared/release-ranking'
import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { ProviderHealth } from '@shared/provider-health'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MovieTorrentSourcesTable } from './movie-torrent-sources-table'

export function MovieTorrentSourcesSection({
  detailPresent,
  torrentLoading,
  torrentData,
  rankedSources,
  addFeedback,
  addBusyMagnet,
  onRefreshSources,
  onQueueDownload,
  onCopyMagnet
}: {
  detailPresent: boolean
  torrentLoading: boolean
  torrentData: TorrentSearchResponse | null
  rankedSources: RankedSources
  addFeedback: string | null
  addBusyMagnet: string | null
  onRefreshSources: () => void
  onQueueDownload: (row: TorrentSource) => void
  onCopyMagnet: (uri: string) => void
}): ReactElement {
  const [health, setHealth] = useState<ProviderHealth[]>([])
  useEffect(() => {
    if (torrentLoading || !torrentData) return
    // Cached results did not query indexers, so their health would be stale.
    if (torrentData.ok && torrentData.cached) {
      setHealth([])
      return
    }
    void window.api.torrent.providerHealth().then(setHealth)
  }, [torrentLoading, torrentData])

  return (
    <div className="space-y-4 border-t border-border pt-4">
      {addFeedback && (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            addFeedback.startsWith('Buffering') ||
              addFeedback.startsWith('Download queued') ||
              addFeedback.startsWith('Added')
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          )}
        >
          {addFeedback}
        </p>
      )}
      {!torrentLoading &&
        torrentData?.ok &&
        torrentData.cached &&
        torrentData.cachedAtMs != null && (
          <p className="text-muted-foreground border-border bg-muted/40 rounded-md border px-3 py-2 text-xs">
            Showing cached results from{' '}
            {new Date(torrentData.cachedAtMs).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short'
            })}{' '}
            (saved up to 5 days). Use Refresh to query indexers again.
          </p>
        )}
      {torrentLoading && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
          <Loader2 className="size-4 animate-spin" />
          Searching for copies…
        </p>
      )}
      {!torrentLoading && torrentData && !torrentData.ok && (
        <p className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm">
          {torrentData.error}
        </p>
      )}
      {!torrentLoading && health.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Indexers:</span>
          {health.map((h) => (
            <span
              key={h.provider}
              title={h.lastError ?? undefined}
              className={cn(
                'rounded-full border px-2 py-0.5',
                h.state === 'ok'
                  ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : h.state === 'skipped'
                    ? 'border-border text-muted-foreground line-through'
                    : 'border-amber-500/40 text-amber-700 dark:text-amber-400'
              )}
            >
              {h.provider}
              {h.state === 'ok' && h.lastResultCount != null ? ` · ${h.lastResultCount}` : ''}
              {h.state === 'failing' ? ` · ${h.lastError ?? 'failed'}` : ''}
              {h.state === 'skipped' ? ' · paused' : ''}
            </span>
          ))}
        </div>
      )}
      {!torrentLoading &&
        torrentData &&
        torrentData.ok &&
        rankedSources.ranked.length === 0 &&
        rankedSources.excluded.length === 0 && (
          <p className="text-muted-foreground text-sm">No torrent rows returned for this title.</p>
        )}
      {!torrentLoading && rankedSources.ranked.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Best matches</h3>
          <MovieTorrentSourcesTable
            rows={rankedSources.ranked}
            addBusyMagnet={addBusyMagnet}
            onQueueDownload={onQueueDownload}
            onCopyMagnet={onCopyMagnet}
          />
        </section>
      )}
      {!torrentLoading && rankedSources.excluded.length > 0 && (
        <details className="space-y-2">
          <summary className="text-muted-foreground cursor-pointer text-sm">
            Other copies ({rankedSources.excluded.length}): cam recordings, other titles, or no
            magnet link
          </summary>
          <MovieTorrentSourcesTable
            rows={rankedSources.excluded}
            addBusyMagnet={addBusyMagnet}
            onQueueDownload={onQueueDownload}
            onCopyMagnet={onCopyMagnet}
          />
        </details>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={torrentLoading || !detailPresent}
          onClick={onRefreshSources}
        >
          <RefreshCw className={cn('size-4', torrentLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>
    </div>
  )
}
