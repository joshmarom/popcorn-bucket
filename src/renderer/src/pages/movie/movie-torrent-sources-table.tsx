import type { TorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl, isValidMagnetUri } from '@shared/torrent'
import { Download } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TorrentQualityBadge } from './torrent-quality-badge'

export function MovieTorrentSourcesTable({
  rows,
  addBusyMagnet,
  onQueueDownload,
  onCopyMagnet,
  onOpenDetails
}: {
  rows: TorrentSource[]
  addBusyMagnet: string | null
  onQueueDownload: (row: TorrentSource) => void
  onCopyMagnet: (uri: string) => void
  onOpenDetails: (url: string) => void
}): ReactElement {
  return (
    <TooltipProvider>
      <div
        role="region"
        aria-label="Torrent sources"
        tabIndex={0}
        className="max-h-[min(55vh,28rem)] bg-black/30 overflow-auto rounded-md border border-border [scrollbar-width:thin]"
      >
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/95 backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80">
              <th className="p-2 font-medium">Title</th>
              <th className="p-2 font-medium">Quality</th>
              <th className="p-2 font-medium">Indexer</th>
              <th className="p-2 font-medium">Size</th>
              <th className="p-2 font-medium">S</th>
              <th className="p-2 font-medium">L</th>
              <th className="p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.title}-${idx}`} className="border-b border-border last:border-0">
                <td className="max-w-[240px] ps-4 p-2 align-top">
                  <span className="line-clamp-2">{row.title}</span>
                </td>
                <td className="text-muted-foreground whitespace-nowrap p-2 align-top">
                  <div>
                    {[
                      row.release.resolution,
                      row.release.source,
                      row.quality?.hdr ?? (row.release.hdr ? 'HDR' : null)
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                  {row.quality ? <TorrentQualityBadge quality={row.quality} /> : null}
                </td>
                <td className="text-muted-foreground whitespace-nowrap p-2 align-top">
                  {row.providerName}
                </td>
                <td className="text-muted-foreground whitespace-nowrap p-2 align-top">
                  {row.size ?? '—'}
                </td>
                <td className="p-2 align-top tabular-nums">{row.seeders}</td>
                <td className="p-2 align-top tabular-nums">{row.leechers}</td>
                <td className="p-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {row.magnetUri && isValidMagnetUri(row.magnetUri) ? (
                      <>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-8 gap-1"
                          disabled={addBusyMagnet !== null}
                          onClick={() => onQueueDownload(row)}
                        >
                          <Download className="size-3.5" />
                          {addBusyMagnet === row.magnetUri ? 'Adding…' : 'Download'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => onCopyMagnet(row.magnetUri!)}
                        >
                          Copy magnet
                        </Button>
                      </>
                    ) : null}
                    {row.detailsUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => onOpenDetails(row.detailsUrl!)}
                      >
                        Details
                      </Button>
                    ) : null}
                    {row.torrentFileUrl && isSafeTorrentDetailsUrl(row.torrentFileUrl) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => onOpenDetails(row.torrentFileUrl!)}
                      >
                        .torrent
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}
