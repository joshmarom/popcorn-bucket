/** Where an MP4's index (`moov` box) sits. Players cannot start until they have it. */
import type { PlayerPreference } from '@shared/preferences'

export type Mp4Layout =
  | { kind: 'faststart' }
  | { kind: 'moov-at-end'; moovOffset: number }
  | { kind: 'unknown' }

/** RAR volumes (`.rar`, `.r00`, `.part01.rar`) and zip archives. */
const ARCHIVE_RE = /\.(rar|r\d{2}|zip)$/i
/** Containers Chromium cannot play natively or via mkv-web; we hand these off to mpv unless forced inline. */
const EXTERNAL_CONTAINER_RE = /\.(avi|ts|m2ts|mpg|mpeg|wmv|flv|vob)$/i
const MKV_EXT_RE = /\.(mkv|matroska)$/i

export function isMkvContainer(fileName: string): boolean {
  return MKV_EXT_RE.test(fileName.trim())
}

export function needsExternalPlayer(fileName: string): boolean {
  const trimmed = fileName.trim()
  return EXTERNAL_CONTAINER_RE.test(trimmed) || ARCHIVE_RE.test(trimmed)
}

export type PlayerChoice =
  | { kind: 'mpv' }
  | { kind: 'inline' }
  | { kind: 'archive-needs-mpv'; reason: 'missing-mpv' | 'inline-only' }

/**
 * Decides whether playback should run in external `mpv` or the in-app Vidstack player based on
 * the user's preference, container support, and whether `mpv` is installed.
 */
export function choosePlaybackTarget(params: {
  preference: PlayerPreference
  fileName: string
  hasInlineUrl: boolean
  mpvInstalled: boolean
}): PlayerChoice {
  const { preference, fileName, hasInlineUrl, mpvInstalled } = params
  if (ARCHIVE_RE.test(fileName.trim())) {
    if (preference === 'inline-only') {
      return { kind: 'archive-needs-mpv', reason: 'inline-only' }
    }
    if (!mpvInstalled) {
      return { kind: 'archive-needs-mpv', reason: 'missing-mpv' }
    }
    return { kind: 'mpv' }
  }

  const inlineCapable = hasInlineUrl && !needsExternalPlayer(fileName)

  switch (preference) {
    case 'mpv-only':
      return { kind: 'mpv' }
    case 'inline-only':
      return hasInlineUrl ? { kind: 'inline' } : { kind: 'mpv' }
    case 'inline':
      return inlineCapable ? { kind: 'inline' } : { kind: 'mpv' }
    case 'mpv':
    default:
      return mpvInstalled || !inlineCapable ? { kind: 'mpv' } : { kind: 'inline' }
  }
}

/** Bytes to read from the start of an MP4 to find its top-level box layout. */
export const MP4_HEAD_PROBE_BYTES = 64 * 1024

const MP4_EXT_RE = /\.(mp4|m4v|mov)$/i

export function isMp4Container(name: string): boolean {
  return MP4_EXT_RE.test(name)
}

/**
 * Walks top-level MP4 boxes in `head`. `moov` before `mdat` means the file can play from the
 * start; `mdat` first means the index follows the media data, near the end of the file.
 */
export function parseMp4Layout(head: Uint8Array, fileLength: number): Mp4Layout {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  let offset = 0
  while (offset + 8 <= head.byteLength) {
    let size = view.getUint32(offset)
    const type = String.fromCharCode(
      head[offset + 4]!,
      head[offset + 5]!,
      head[offset + 6]!,
      head[offset + 7]!
    )
    if (size === 1) {
      if (offset + 16 > head.byteLength) return { kind: 'unknown' }
      size = Number(view.getBigUint64(offset + 8))
    }
    if (type === 'moov') return { kind: 'faststart' }
    if (type === 'mdat') {
      if (size === 0) return { kind: 'unknown' }
      const moovOffset = offset + size
      return moovOffset < fileLength ? { kind: 'moov-at-end', moovOffset } : { kind: 'unknown' }
    }
    if (size < 8) return { kind: 'unknown' }
    offset += size
  }
  return { kind: 'unknown' }
}

/** Contiguous bytes from the start of the file needed before playback starts smoothly. */
export function headBytesNeeded(fileLength: number): number {
  if (fileLength <= 0) return 0
  return Math.min(fileLength, Math.max(4 * 1024 * 1024, fileLength * 0.01))
}
