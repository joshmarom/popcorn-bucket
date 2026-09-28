export type AppSettings = {
  tmdbApiKey: string
  tmdbReadAccessToken: string
  /** Optional: used to fill missing movie posters when TMDB has no `poster_path`. */
  omdbApiKey: string
  /** Optional: enables subtitle lookup on opensubtitles.com. */
  openSubtitlesApiKey: string
  /** Optional: unlocks magnets from torrentclaw.com. Discovery works without it. */
  torrentClawApiKey: string
}

export const defaultAppSettings: AppSettings = {
  tmdbApiKey: '',
  tmdbReadAccessToken: '',
  omdbApiKey: '',
  openSubtitlesApiKey: '',
  torrentClawApiKey: ''
}

/** How TorrentClaw treated the configured key on the most recent request. */
export type TorrentClawKeyStatus = 'active' | 'rejected' | 'anonymous'
