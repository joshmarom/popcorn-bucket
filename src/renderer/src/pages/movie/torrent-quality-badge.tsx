import type { TorrentQualityInfo } from '@shared/torrent'
import { BadgeCheck } from 'lucide-react'
import type { ReactElement } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function channelLabel(channels: number | null): string | null {
  if (channels == null) return null
  if (channels === 6) return '5.1'
  if (channels === 8) return '7.1'
  if (channels === 2) return 'stereo'
  return `${channels}ch`
}

function uniq(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
}

function detailLines(q: TorrentQualityInfo): string[] {
  const lines: string[] = []
  const video = [
    q.videoHeight ? `${q.videoHeight}p` : null,
    q.videoCodec?.toUpperCase() ?? null,
    q.hdr
  ].filter(Boolean)
  if (video.length > 0) lines.push(`Video: ${video.join(' · ')}`)
  const audio = uniq(
    q.audioTracks.map((a) =>
      [a.lang?.toUpperCase(), a.codec?.toUpperCase(), channelLabel(a.channels)]
        .filter(Boolean)
        .join(' ')
    )
  )
  if (audio.length > 0)
    lines.push(`Audio: ${audio.slice(0, 6).join(', ')}${audio.length > 6 ? '…' : ''}`)
  else if (q.languages.length > 0)
    lines.push(`Audio: ${uniq(q.languages).join(', ').toUpperCase()}`)
  const subs = uniq(q.subtitleLangs.map((s) => s.toUpperCase()))
  if (subs.length > 0)
    lines.push(`Subtitles: ${subs.slice(0, 12).join(', ')}${subs.length > 12 ? '…' : ''}`)
  if (q.releaseGroup) lines.push(`Group: ${q.releaseGroup}`)
  if (q.score != null) lines.push(`TorrentClaw score: ${q.score}/100`)
  return lines
}

/** Verified badge plus TorrentClaw score, with scanned file details on hover. */
export function TorrentQualityBadge({
  quality
}: {
  quality: TorrentQualityInfo
}): ReactElement | null {
  const lines = detailLines(quality)
  if (!quality.verified && quality.score == null) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">
          {quality.verified ? (
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-xs">
              <BadgeCheck aria-hidden className="size-3" />
              Verified
            </Badge>
          ) : null}
          {quality.score != null ? (
            <span className="text-muted-foreground text-xs tabular-nums">{quality.score}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="space-y-0.5">
        {quality.verified ? (
          <p className="font-medium">Checked against the actual files</p>
        ) : (
          <p className="font-medium">From the release name (not scanned)</p>
        )}
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
