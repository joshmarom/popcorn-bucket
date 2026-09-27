/** Where an MP4's index (`moov` box) sits. Players cannot start until they have it. */
export type Mp4Layout =
  | { kind: 'faststart' }
  | { kind: 'moov-at-end'; moovOffset: number }
  | { kind: 'unknown' }

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
