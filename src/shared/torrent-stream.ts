/** Sidecar caption files from the torrent, exposed to the player as remote text tracks. */
export type TorrentSubtitleTrack = {
  src: string
  label: string
  /** Parsed captions format for Vidstack / media-captions. */
  type: 'vtt' | 'srt' | 'ssa' | 'ass'
  /** Optional BCP-47-ish tag when inferred from the filename. */
  language?: string
}

export type InlinePlayerSession = {
  movieId: number
  downloadId: string
  streamUrl: string
  fileLabel: string
  subtitles: TorrentSubtitleTrack[]
  /** Resume position in seconds (0 to start from the beginning). */
  startSeconds: number
}

export type TorrentStreamStartResponse =
  | ({
      ok: true
      /** In-app Vidstack player opened in a dedicated popup window. */
      kind: 'inline'
    } & InlinePlayerSession)
  | {
      ok: true
      /** Playback was handed off to an external player (mpv). */
      kind: 'external'
      player: 'mpv'
      fileLabel: string
    }
  | { ok: false; error: string }
