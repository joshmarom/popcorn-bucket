export type AppSettings = {
  tmdbApiKey: string
  tmdbReadAccessToken: string
  /** Optional: used to fill missing movie posters when TMDB has no `poster_path`. */
  omdbApiKey: string
  /** Optional: enables subtitle lookup on opensubtitles.com. */
  openSubtitlesApiKey: string
}

export const defaultAppSettings: AppSettings = {
  tmdbApiKey: '',
  tmdbReadAccessToken: '',
  omdbApiKey: '',
  openSubtitlesApiKey: ''
}
