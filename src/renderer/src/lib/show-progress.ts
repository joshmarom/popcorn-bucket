import { episodeCode, isEpisodeMediaKey, type TvShowDetails } from '@shared/tv'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import { resumePosition, type WatchProgress } from '@shared/watch-history'

export type ShowInProgress = {
  showId: number
  showName: string
  seasonNumber: number
  episodeNumber: number
  progress: WatchProgress
}

/**
 * Episodes in progress, one per show (the most recently watched). Episode progress is keyed by
 * episode id, so the show comes from the download that played it.
 */
export function showsInProgress(
  history: WatchProgress[],
  downloads: MovieTorrentDownloadSnapshot[]
): ShowInProgress[] {
  const byShow = new Map<number, ShowInProgress>()
  const sorted = [...history].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const progress of sorted) {
    if (!isEpisodeMediaKey(progress.movieId) || resumePosition(progress) <= 0) continue
    const episode = downloads.find((d) => d.movieId === progress.movieId)?.episode
    if (!episode || byShow.has(episode.showId)) continue
    byShow.set(episode.showId, {
      showId: episode.showId,
      showName: episode.showName,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      progress
    })
  }
  return [...byShow.values()]
}

export function formatRemaining(p: WatchProgress): string {
  const mins = Math.max(1, Math.round((p.duration - p.position) / 60))
  return `${mins} min left`
}

export function episodeNote(item: ShowInProgress): string {
  return `${episodeCode(item.seasonNumber, item.episodeNumber)} · ${formatRemaining(item.progress)}`
}

/** Show details for posters; failures are skipped. */
export async function loadShows(ids: number[]): Promise<Map<number, TvShowDetails>> {
  const out = new Map<number, TvShowDetails>()
  const results = await Promise.all(ids.map((id) => window.api.tv.getShow(id).catch(() => null)))
  results.forEach((res, i) => {
    if (res?.ok) out.set(ids[i]!, res.show)
  })
  return out
}
