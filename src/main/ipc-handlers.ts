import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { isAbsolute } from 'node:path'
import type { AuthSignInResult, AuthStatus } from '@shared/auth'
import type { Preferences } from '@shared/preferences'
import {
  STREAMING_SERVICES,
  type AutocompleteResponse,
  type DiscoverCollectionResponse,
  type DiscoverCollectionsResponse,
  type DiscoverListResponse,
  type DiscoverShowListResponse,
  type ResolveSuggestionResponse,
  type StreamingService
} from '@shared/discovery'
import { getPreferences, preferencesSchema, setPreferences } from './preferences-store'
import { baseDownloadDir, defaultDownloadDir } from './torrent/webtorrent-core'
import { isVidkingEmbedUrl, openOrFocusVidkingEmbed } from './vidking-embed-window'
import { clearVidkingSessionData } from './vidking-session'
import { z } from 'zod'
import type {
  CatalogGenreRailsResponse,
  CatalogMovieListFactsResponse,
  CatalogMovieResponse,
  CatalogSearchResponse,
  CatalogTrendingPageResponse
} from '@shared/catalog'
import { isSafeTorrentDetailsUrl, type TorrentSearchResponse } from '@shared/torrent'
import type { MovieTorrentDownloadSnapshot, UntrackedDownload } from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse } from '@shared/torrent-stream'
import type { ProviderHealth } from '@shared/provider-health'
import type {
  TvSearchResponse,
  TvSeasonResponse,
  TvGenreRailsResponse,
  TvListPageResponse,
  TvShowListFactsResponse,
  TvShowListResponse,
  TvShowResponse
} from '@shared/tv'
import {
  addMovieDownload,
  endStreamingPlayback,
  getAllMovieDownloads,
  getDownloadLocation,
  deleteUntrackedDownload,
  recoverUntrackedDownload,
  scanUntrackedDownloads,
  getMovieDownloads,
  removeMovieDownload,
  setMovieDownloadPaused,
  startMoviePlayback
} from './torrent/movie-downloads'
import { mpvEvents } from './torrent/mpv-controller'
import {
  clearWatchProgress,
  getWatchProgress,
  getShowWatchlist,
  getWatchlist,
  setShowInWatchlist,
  listWatchProgress,
  recordWatchProgress,
  setInWatchlist
} from './watch-history'
import type { WatchProgress } from '@shared/watch-history'
import { readVidkingDiagnostics, type VidkingNetEvent } from './vidking-diagnostics'
import { apiJson, apiSignIn, broadcastAuthStatus } from './api-client'
import { clearSession, getCachedSession, getSessionToken, setSession } from './session-store'

const searchInput = z.object({
  query: z.string().min(1).max(200)
})

const tvSearchInput = searchInput.extend({
  page: z.number().int().positive().max(500).optional()
})

const movieInput = z.object({
  id: z.number().int().positive()
})

const listFactsInput = z.object({
  ids: z.array(z.number().int().positive()).max(40)
})

const discoverGenreInput = z.object({
  genreId: z.number().int().positive()
})

const signInInput = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200)
})

const torrentSearchInput = z.object({
  title: z.string().min(1).max(400),
  releaseDate: z.string().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  forceRefresh: z.boolean().optional()
})

const episodeTargetInput = z.object({
  showId: z.number().int().positive(),
  showName: z.string().min(1).max(400),
  seasonNumber: z.number().int().min(0).max(200),
  episodeNumber: z.number().int().min(0).max(5000)
})

const tvSeasonInput = z.object({
  showId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0).max(200)
})

const addMovieTorrentInput = z.object({
  movieId: z.number().int().positive(),
  movieTitle: z.string().max(400).default(''),
  episode: episodeTargetInput.optional(),
  magnetUri: z.string().min(30).max(50_000),
  title: z.string().min(1).max(800),
  indexerSeeders: z.number().int().nonnegative(),
  indexerLeechers: z.number().int().nonnegative()
})

const movieDownloadIdInput = z.object({
  movieId: z.number().int().positive(),
  downloadId: z.string().uuid()
})

const movieDownloadPauseInput = z.object({
  movieId: z.number().int().positive(),
  downloadId: z.string().uuid(),
  paused: z.boolean()
})

const untrackedRecoverInput = z.object({
  dir: z.string().min(1).max(2000),
  movieTitle: z.string().max(400).default('')
})

const historyReportInput = z.object({
  movieId: z.number().int().positive(),
  position: z.number().nonnegative(),
  duration: z.number().positive()
})

const watchlistSetInput = z.object({
  movieId: z.number().int().positive(),
  inList: z.boolean()
})

const catalogTrendingPageInput = z.object({
  page: z.number().int().positive().max(5000).optional(),
  forceRefresh: z.boolean().optional()
})

const tvDiscoverGenreInput = z.object({
  genreId: z.number().int().positive(),
  page: z.number().int().positive().max(5000).default(1)
})

const showWatchlistSetInput = z.object({
  showId: z.number().int().positive(),
  inList: z.boolean()
})

const streamingTopInput = z.object({
  service: z.enum(STREAMING_SERVICES.map((s) => s.id) as [StreamingService, ...StreamingService[]])
})

const autocompleteInput = z.object({
  q: z.string().trim().min(2).max(100)
})

const resolveSuggestionInput = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(400),
  year: z.number().int().nullable(),
  contentType: z.enum(['movie', 'show', 'collection'])
})

type MeResponse =
  | { ok: true; id: string; email: string; name: string; role: string }
  | { ok: false; error: string }

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

async function restoreSession(): Promise<AuthStatus> {
  if (!getSessionToken()) {
    clearSession()
    return { signedIn: false }
  }
  const me = await apiJson<MeResponse>('/v1/me')
  if (me.ok) {
    setSession(getSessionToken(), { email: me.email, name: me.name, role: me.role })
    return { signedIn: true, email: me.email, name: me.name, role: me.role }
  }
  if (!getSessionToken()) return { signedIn: false }
  const cached = getCachedSession()
  if (cached) return { signedIn: true, ...cached }
  return { signedIn: false }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('auth:status', async (): Promise<AuthStatus> => restoreSession())

  ipcMain.handle('auth:signIn', async (_evt, raw: unknown): Promise<AuthSignInResult> => {
    const parsed = signInInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Enter a valid email and password.' }
    const signed = await apiSignIn(parsed.data.email, parsed.data.password)
    if ('error' in signed) return { ok: false, error: signed.error }
    setSession(signed.token, { email: parsed.data.email, name: '', role: 'user' })
    const me = await apiJson<MeResponse>('/v1/me')
    if (!me.ok) {
      clearSession()
      broadcastAuthStatus()
      return { ok: false, error: me.error }
    }
    setSession(signed.token, { email: me.email, name: me.name, role: me.role })
    broadcastAuthStatus()
    return { ok: true, email: me.email, name: me.name, role: me.role }
  })

  ipcMain.handle('auth:signOut', (): AuthStatus => {
    clearSession()
    broadcastAuthStatus()
    return { signedIn: false }
  })

  ipcMain.handle('prefs:get', (): Preferences => getPreferences())

  ipcMain.handle(
    'prefs:set',
    (_evt, raw: unknown): { ok: true; prefs: Preferences } | { ok: false; error: string } => {
      const parsed = preferencesSchema.partial().safeParse(raw)
      if (!parsed.success) return { ok: false, error: 'Invalid preferences.' }
      if (parsed.data.downloadDir && !isAbsolute(parsed.data.downloadDir)) {
        return { ok: false, error: 'Download folder must be an absolute path.' }
      }
      return { ok: true, prefs: setPreferences(parsed.data) }
    }
  )

  ipcMain.handle('prefs:chooseDownloadDir', async (evt): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    const opts = {
      title: 'Choose download folder',
      defaultPath: baseDownloadDir(),
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle('prefs:defaultDownloadDir', (): string => defaultDownloadDir())

  ipcMain.handle('app:openExternal', async (_evt, raw: unknown): Promise<void> => {
    if (typeof raw !== 'string' || !isSafeTorrentDetailsUrl(raw)) {
      throw new Error('Only https:// links may be opened.')
    }
    await shell.openExternal(raw)
  })

  ipcMain.handle('downloads:scanUntracked', (): UntrackedDownload[] => scanUntrackedDownloads())

  ipcMain.handle('downloads:recoverUntracked', (_evt, raw: unknown) => {
    const parsed = untrackedRecoverInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }
    return recoverUntrackedDownload(parsed.data.dir, parsed.data.movieTitle || null)
  })

  ipcMain.handle('downloads:deleteUntracked', async (_evt, raw: unknown) => {
    const parsed = z.string().min(1).max(2000).safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }
    return deleteUntrackedDownload(parsed.data)
  })

  ipcMain.handle('app:showDownloadInFolder', (_evt, raw: unknown): void => {
    const parsed = z.string().uuid().safeParse(raw)
    if (!parsed.success) return
    const location = getDownloadLocation(parsed.data)
    if (location) shell.showItemInFolder(location)
  })

  ipcMain.handle('app:openVidkingEmbed', (evt, raw: unknown): void => {
    if (typeof raw !== 'string' || !isVidkingEmbedUrl(raw)) {
      throw new Error('Invalid VidCore embed URL.')
    }
    const parent = BrowserWindow.fromWebContents(evt.sender)
    openOrFocusVidkingEmbed(raw, parent)
  })

  ipcMain.handle('app:clearVidkingData', async (): Promise<void> => {
    await clearVidkingSessionData()
  })

  ipcMain.handle('app:getVidkingDiagnostics', (): VidkingNetEvent[] => {
    return readVidkingDiagnostics()
  })

  ipcMain.handle('torrent:search', async (_evt, raw: unknown): Promise<TorrentSearchResponse> => {
    const parsed = torrentSearchInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Invalid search payload.', code: 'VALIDATION' }
    }
    return apiJson('/v1/torrents/search', {
      method: 'POST',
      body: JSON.stringify({
        title: parsed.data.title,
        releaseDate: parsed.data.releaseDate ?? null,
        imdbId: parsed.data.imdbId ?? null,
        forceRefresh: parsed.data.forceRefresh ?? false
      }),
      timeoutMs: 60_000
    })
  })

  ipcMain.handle('torrent:providerHealth', async (): Promise<ProviderHealth[]> => {
    const rows = await apiJson<ProviderHealth[] | { ok: false }>('/v1/torrents/providers/health')
    return Array.isArray(rows) ? rows : []
  })

  ipcMain.handle('torrent:addMovieDownload', (_evt, raw: unknown) => {
    const parsed = addMovieTorrentInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Invalid download request.' }
    }
    return addMovieDownload(parsed.data)
  })

  ipcMain.handle('torrent:getMovieDownloads', (_evt, raw: unknown) => {
    const parsed = movieInput.safeParse(raw)
    if (!parsed.success) {
      return []
    }
    return getMovieDownloads(parsed.data.id)
  })

  ipcMain.handle('torrent:getAllMovieDownloads', (): MovieTorrentDownloadSnapshot[] => {
    return getAllMovieDownloads()
  })

  ipcMain.handle('torrent:removeMovieDownload', async (_evt, raw: unknown) => {
    const parsed = movieDownloadIdInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Invalid request.' as const }
    }
    return removeMovieDownload(parsed.data.movieId, parsed.data.downloadId)
  })

  ipcMain.handle(
    'torrent:startMoviePlayback',
    async (_evt, raw: unknown): Promise<TorrentStreamStartResponse> => {
      const parsed = movieDownloadIdInput.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: 'Invalid playback request.' }
      }
      try {
        return await startMoviePlayback(parsed.data.movieId, parsed.data.downloadId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg || 'Playback failed unexpectedly.' }
      }
    }
  )

  ipcMain.handle('history:list', (): Promise<WatchProgress[]> => listWatchProgress())

  ipcMain.handle('history:get', async (_evt, raw: unknown): Promise<WatchProgress | null> => {
    const parsed = movieInput.safeParse(raw)
    return parsed.success ? getWatchProgress(parsed.data.id) : null
  })

  ipcMain.handle('history:report', async (_evt, raw: unknown): Promise<void> => {
    const parsed = historyReportInput.safeParse(raw)
    if (parsed.success) {
      await recordWatchProgress(parsed.data.movieId, parsed.data.position, parsed.data.duration)
    }
  })

  ipcMain.handle('history:clear', async (_evt, raw: unknown): Promise<void> => {
    const parsed = movieInput.safeParse(raw)
    if (parsed.success) await clearWatchProgress(parsed.data.id)
  })

  ipcMain.handle('watchlist:get', (): Promise<number[]> => getWatchlist())

  ipcMain.handle('watchlist:set', async (_evt, raw: unknown): Promise<number[]> => {
    const parsed = watchlistSetInput.safeParse(raw)
    if (!parsed.success) return getWatchlist()
    return setInWatchlist(parsed.data.movieId, parsed.data.inList)
  })

  ipcMain.handle('torrent:endInlinePlayback', (): void => {
    endStreamingPlayback('inline')
  })

  ipcMain.handle('torrent:setMovieDownloadPaused', async (_evt, raw: unknown) => {
    const parsed = movieDownloadPauseInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Invalid request.' as const }
    }
    return setMovieDownloadPaused(parsed.data.movieId, parsed.data.downloadId, parsed.data.paused)
  })

  mpvEvents.on('end', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue
      try {
        w.webContents.send('mpv:end', null)
      } catch {
        /* window may have gone away mid-send */
      }
    }
  })

  ipcMain.handle(
    'catalog:trendingPage',
    async (_evt, raw: unknown): Promise<CatalogTrendingPageResponse> => {
      const parsed = catalogTrendingPageInput.safeParse(raw ?? {})
      if (!parsed.success) {
        return { ok: false, error: 'Invalid page.', code: 'VALIDATION' }
      }
      return apiJson(
        `/v1/catalog/trending${query({
          page: parsed.data.page,
          forceRefresh: parsed.data.forceRefresh ? '1' : undefined
        })}`
      )
    }
  )

  ipcMain.handle('discover:popular', (): Promise<DiscoverListResponse> => {
    return apiJson('/v1/discover/popular')
  })

  ipcMain.handle('discover:upcoming', (): Promise<DiscoverListResponse> => {
    return apiJson('/v1/discover/upcoming')
  })

  ipcMain.handle(
    'discover:streamingTop',
    async (_evt, raw: unknown): Promise<DiscoverListResponse> => {
      const parsed = streamingTopInput.safeParse(raw)
      if (!parsed.success) return { ok: false, error: 'Unknown streaming service.' }
      return apiJson(`/v1/discover/streaming-top${query({ service: parsed.data.service })}`)
    }
  )

  ipcMain.handle('discover:collections', (): Promise<DiscoverCollectionsResponse> => {
    return apiJson('/v1/discover/collections')
  })

  ipcMain.handle(
    'discover:collection',
    async (_evt, raw: unknown): Promise<DiscoverCollectionResponse> => {
      const parsed = movieInput.safeParse(raw)
      if (!parsed.success) return { ok: false, error: 'Invalid collection id.' }
      return apiJson(`/v1/discover/collections/${parsed.data.id}`)
    }
  )

  ipcMain.handle(
    'discover:autocomplete',
    async (_evt, raw: unknown): Promise<AutocompleteResponse> => {
      const parsed = autocompleteInput.safeParse(raw)
      if (!parsed.success) return { ok: true, suggestions: [] }
      return apiJson(`/v1/discover/autocomplete${query({ q: parsed.data.q })}`)
    }
  )

  ipcMain.handle(
    'discover:resolveSuggestion',
    async (_evt, raw: unknown): Promise<ResolveSuggestionResponse> => {
      const parsed = resolveSuggestionInput.safeParse(raw)
      if (!parsed.success) return { ok: false, error: 'Invalid suggestion.' }
      return apiJson('/v1/discover/resolve', {
        method: 'POST',
        body: JSON.stringify(parsed.data)
      })
    }
  )

  ipcMain.handle('catalog:search', async (_evt, raw: unknown): Promise<CatalogSearchResponse> => {
    const parsed = searchInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Enter a search query.', code: 'VALIDATION' }
    }
    return apiJson(`/v1/catalog/search${query({ query: parsed.data.query })}`)
  })

  ipcMain.handle('catalog:genreRails', (): Promise<CatalogGenreRailsResponse> => {
    return apiJson('/v1/catalog/genre-rails')
  })

  ipcMain.handle(
    'catalog:discoverGenre',
    async (_evt, raw: unknown): Promise<CatalogSearchResponse> => {
      const parsed = discoverGenreInput.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: 'Invalid genre.', code: 'VALIDATION' }
      }
      return apiJson(`/v1/catalog/discover${query({ genreId: parsed.data.genreId })}`)
    }
  )

  ipcMain.handle('tv:trendingPage', async (_evt, raw: unknown): Promise<TvListPageResponse> => {
    const parsed = catalogTrendingPageInput.safeParse(raw ?? {})
    if (!parsed.success) return { ok: false, error: 'Invalid page.' }
    return apiJson(
      `/v1/tv/trending${query({
        page: parsed.data.page,
        forceRefresh: parsed.data.forceRefresh ? '1' : undefined
      })}`
    )
  })

  ipcMain.handle('tv:searchAll', async (_evt, raw: unknown): Promise<TvShowListResponse> => {
    const parsed = searchInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Enter a search query.' }
    return apiJson(`/v1/tv/search-all${query({ query: parsed.data.query })}`)
  })

  ipcMain.handle('tv:onTheAir', (): Promise<TvShowListResponse> => {
    return apiJson('/v1/tv/on-the-air')
  })

  ipcMain.handle('tv:genreRails', (): Promise<TvGenreRailsResponse> => {
    return apiJson('/v1/tv/genre-rails')
  })

  ipcMain.handle('tv:genres', async (): Promise<{ id: number; name: string }[]> => {
    const rows = await apiJson<{ id: number; name: string }[] | { ok: false }>('/v1/tv/genres')
    return Array.isArray(rows) ? rows : []
  })

  ipcMain.handle('tv:discoverGenre', async (_evt, raw: unknown): Promise<TvListPageResponse> => {
    const parsed = tvDiscoverGenreInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid genre.' }
    return apiJson(
      `/v1/tv/discover${query({ genreId: parsed.data.genreId, page: parsed.data.page })}`
    )
  })

  ipcMain.handle('discover:popularShows', (): Promise<DiscoverShowListResponse> => {
    return apiJson('/v1/discover/popular-shows')
  })

  ipcMain.handle(
    'discover:streamingTopShows',
    async (_evt, raw: unknown): Promise<DiscoverShowListResponse> => {
      const parsed = streamingTopInput.safeParse(raw)
      if (!parsed.success) return { ok: false, error: 'Unknown streaming service.' }
      return apiJson(`/v1/discover/streaming-top-shows${query({ service: parsed.data.service })}`)
    }
  )

  ipcMain.handle('tvWatchlist:get', (): Promise<number[]> => getShowWatchlist())

  ipcMain.handle('tvWatchlist:set', async (_evt, raw: unknown): Promise<number[]> => {
    const parsed = showWatchlistSetInput.safeParse(raw)
    if (!parsed.success) return getShowWatchlist()
    return setShowInWatchlist(parsed.data.showId, parsed.data.inList)
  })

  ipcMain.handle('tv:search', async (_evt, raw: unknown): Promise<TvSearchResponse> => {
    const parsed = tvSearchInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Enter a search query.' }
    return apiJson(
      `/v1/tv/search${query({ query: parsed.data.query, page: parsed.data.page })}`
    )
  })

  ipcMain.handle('tv:listFacts', async (_evt, raw: unknown): Promise<TvShowListFactsResponse> => {
    const parsed = listFactsInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid show ids.' }
    return apiJson(`/v1/tv/list-facts${query({ ids: parsed.data.ids.join(',') })}`)
  })

  ipcMain.handle('tv:getShow', async (_evt, raw: unknown): Promise<TvShowResponse> => {
    const parsed = movieInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid show id.' }
    return apiJson(`/v1/tv/shows/${parsed.data.id}`)
  })

  ipcMain.handle('tv:getSeason', async (_evt, raw: unknown): Promise<TvSeasonResponse> => {
    const parsed = tvSeasonInput.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'Invalid season.' }
    return apiJson(`/v1/tv/shows/${parsed.data.showId}/seasons/${parsed.data.seasonNumber}`)
  })

  ipcMain.handle(
    'catalog:listFacts',
    async (_evt, raw: unknown): Promise<CatalogMovieListFactsResponse> => {
      const parsed = listFactsInput.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: 'Invalid movie ids.', code: 'VALIDATION' }
      }
      return apiJson(`/v1/catalog/list-facts${query({ ids: parsed.data.ids.join(',') })}`)
    }
  )

  ipcMain.handle('catalog:getMovie', async (_evt, raw: unknown): Promise<CatalogMovieResponse> => {
    const parsed = movieInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Invalid movie id.', code: 'VALIDATION' }
    }
    return apiJson(`/v1/catalog/movies/${parsed.data.id}`)
  })
}
