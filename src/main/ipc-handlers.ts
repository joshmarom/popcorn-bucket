import { BrowserWindow, ipcMain, shell } from 'electron'
import { isVidkingEmbedUrl, openOrFocusVidkingEmbed } from './vidking-embed-window'
import { clearVidkingSessionData } from './vidking-session'
import { z } from 'zod'
import {
  shouldIncludeCatalogListItem,
  type CatalogErrorCode,
  type CatalogGenreRail,
  type CatalogGenreRailsResponse,
  type CatalogMovieResponse,
  type CatalogSearchResponse
} from '@shared/catalog'
import { isSafeTorrentDetailsUrl, type TorrentSearchResponse } from '@shared/torrent'
import type { MovieTorrentDownloadSnapshot } from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse } from '@shared/torrent-stream'
import {
  getAppSettings,
  getStoredSettings,
  isSecretStorageEncrypted,
  setAppSettings
} from './settings-store'
import { searchTorrentSources } from './torrent/orchestrator'
import { readTorrentSearchCache, writeTorrentSearchCache } from './torrent/torrent-search-cache'
import { resolveTorrentSearchInput } from './torrent/torrent-search-resolve'
import {
  addMovieDownload,
  endStreamingPlayback,
  getAllMovieDownloads,
  getMovieDownloads,
  removeMovieDownload,
  setMovieDownloadPaused,
  startMoviePlayback
} from './torrent/movie-downloads'
import { mpvEvents } from './torrent/mpv-controller'
import { enrichCatalogListWithOmdb, enrichMovieDetailsWithOmdb } from './omdb'
import {
  discoverMoviesByGenre,
  discoverMoviesByGenreFirstPage,
  getMovieDetails,
  getMovieGenres,
  hasTmdbCredentials,
  searchMovies
} from './tmdb'
import { getTrendingWatchableMovies } from './torrent/trending-watchable'
import {
  clearWatchProgress,
  getWatchProgress,
  getWatchlist,
  listWatchProgress,
  recordWatchProgress,
  setInWatchlist
} from './watch-history'
import type { WatchProgress } from '@shared/watch-history'
import { readVidkingDiagnostics, type VidkingNetEvent } from './vidking-diagnostics'

const searchInput = z.object({
  query: z.string().min(1).max(200)
})

const movieInput = z.object({
  id: z.number().int().positive()
})

const discoverGenreInput = z.object({
  genreId: z.number().int().positive()
})

const settingsInput = z.object({
  tmdbApiKey: z.string().optional(),
  tmdbReadAccessToken: z.string().optional(),
  omdbApiKey: z.string().optional()
})

const torrentSearchInput = z.object({
  title: z.string().min(1).max(400),
  releaseDate: z.string().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  forceRefresh: z.boolean().optional()
})

const addMovieTorrentInput = z.object({
  movieId: z.number().int().positive(),
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

const historyReportInput = z.object({
  movieId: z.number().int().positive(),
  position: z.number().nonnegative(),
  duration: z.number().positive()
})

const watchlistSetInput = z.object({
  movieId: z.number().int().positive(),
  inList: z.boolean()
})

const catalogNowPlayingInput = z.object({
  forceRefresh: z.boolean().optional()
})

function mapCatalogError(err: unknown): { error: string; code: CatalogErrorCode } {
  if (err instanceof z.ZodError) {
    return { error: 'Invalid request', code: 'VALIDATION' }
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'NO_CREDENTIALS') {
    return {
      error: 'Add your TMDB Read Access Token or API key in Settings.',
      code: 'NO_CREDENTIALS'
    }
  }
  if (msg.startsWith('TMDB_HTTP_')) {
    return { error: `TMDB request failed (${msg.slice(0, 80)})`, code: 'BAD_RESPONSE' }
  }
  if (msg === 'BAD_RESPONSE') {
    return { error: 'Unexpected response from TMDB.', code: 'BAD_RESPONSE' }
  }
  return { error: msg || 'Unknown error', code: 'NETWORK' }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('settings:get', () => {
    return getStoredSettings()
  })

  ipcMain.handle('settings:isEncrypted', (): boolean => isSecretStorageEncrypted())

  ipcMain.handle('settings:set', (_evt, raw: unknown) => {
    const parsed = settingsInput.safeParse(raw)
    if (!parsed.success) {
      throw new Error('Invalid settings payload')
    }
    setAppSettings(parsed.data)
  })

  ipcMain.handle('app:openExternal', async (_evt, raw: unknown): Promise<void> => {
    if (typeof raw !== 'string' || !isSafeTorrentDetailsUrl(raw)) {
      throw new Error('Only https:// links may be opened.')
    }
    await shell.openExternal(raw)
  })

  ipcMain.handle('app:openVidkingEmbed', (evt, raw: unknown): void => {
    if (typeof raw !== 'string' || !isVidkingEmbedUrl(raw)) {
      throw new Error('Invalid VidSrc embed URL.')
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
    const d = parsed.data
    const input = {
      title: d.title,
      releaseDate: d.releaseDate ?? null,
      imdbId: d.imdbId ?? null,
      forceRefresh: d.forceRefresh ?? false
    }
    const resolved = resolveTorrentSearchInput(input)
    if (!resolved.valid) {
      return resolved.response
    }
    if (!input.forceRefresh) {
      const cached = readTorrentSearchCache(resolved.cacheKey)
      if (cached) {
        return cached
      }
    }
    const fresh = await searchTorrentSources(getAppSettings(), input)
    if (fresh.ok) {
      writeTorrentSearchCache(resolved.cacheKey, fresh)
    }
    return fresh
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

  ipcMain.handle('history:list', (): WatchProgress[] => listWatchProgress())

  ipcMain.handle('history:get', (_evt, raw: unknown): WatchProgress | null => {
    const parsed = movieInput.safeParse(raw)
    return parsed.success ? getWatchProgress(parsed.data.id) : null
  })

  ipcMain.handle('history:report', (_evt, raw: unknown): void => {
    const parsed = historyReportInput.safeParse(raw)
    if (parsed.success) {
      recordWatchProgress(parsed.data.movieId, parsed.data.position, parsed.data.duration)
    }
  })

  ipcMain.handle('history:clear', (_evt, raw: unknown): void => {
    const parsed = movieInput.safeParse(raw)
    if (parsed.success) clearWatchProgress(parsed.data.id)
  })

  ipcMain.handle('watchlist:get', (): number[] => getWatchlist())

  ipcMain.handle('watchlist:set', (_evt, raw: unknown): number[] => {
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
    'catalog:nowPlaying',
    async (_evt, raw: unknown): Promise<CatalogSearchResponse> => {
      const parsed = catalogNowPlayingInput.safeParse(raw ?? {})
      const forceRefresh = parsed.success ? parsed.data.forceRefresh === true : false
      const settings = getAppSettings()
      if (!hasTmdbCredentials(settings)) {
        return {
          ok: false,
          error: 'Add your TMDB credentials in Settings first.',
          code: 'NO_CREDENTIALS'
        }
      }
      try {
        const results = await getTrendingWatchableMovies(settings, { forceRefresh })
        return { ok: true, results }
      } catch (e) {
        const m = mapCatalogError(e)
        return { ok: false, error: m.error, code: m.code }
      }
    }
  )

  ipcMain.handle('catalog:search', async (_evt, raw: unknown): Promise<CatalogSearchResponse> => {
    const parsed = searchInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Enter a search query.', code: 'VALIDATION' }
    }
    const settings = getAppSettings()
    if (!hasTmdbCredentials(settings)) {
      return {
        ok: false,
        error: 'Add your TMDB credentials in Settings first.',
        code: 'NO_CREDENTIALS'
      }
    }
    try {
      const raw = await searchMovies(settings, parsed.data.query)
      const enriched = await enrichCatalogListWithOmdb(settings, raw)
      const results = enriched.filter(shouldIncludeCatalogListItem)
      return { ok: true, results }
    } catch (e) {
      const m = mapCatalogError(e)
      return { ok: false, error: m.error, code: m.code }
    }
  })

  ipcMain.handle('catalog:genreRails', async (): Promise<CatalogGenreRailsResponse> => {
    const settings = getAppSettings()
    if (!hasTmdbCredentials(settings)) {
      return {
        ok: false,
        error: 'Add your TMDB credentials in Settings first.',
        code: 'NO_CREDENTIALS'
      }
    }
    try {
      const genres = await getMovieGenres(settings)
      const rails: CatalogGenreRail[] = []
      const stripMax = 15
      for (const genre of genres) {
        const raw = await discoverMoviesByGenreFirstPage(settings, genre.id)
        const movies = raw.filter(shouldIncludeCatalogListItem).slice(0, stripMax)
        if (movies.length === 0) continue
        rails.push({ genre, movies })
      }
      return { ok: true, rails }
    } catch (e) {
      const m = mapCatalogError(e)
      return { ok: false, error: m.error, code: m.code }
    }
  })

  ipcMain.handle(
    'catalog:discoverGenre',
    async (_evt, raw: unknown): Promise<CatalogSearchResponse> => {
      const parsed = discoverGenreInput.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: 'Invalid genre.', code: 'VALIDATION' }
      }
      const settings = getAppSettings()
      if (!hasTmdbCredentials(settings)) {
        return {
          ok: false,
          error: 'Add your TMDB credentials in Settings first.',
          code: 'NO_CREDENTIALS'
        }
      }
      try {
        const raw = await discoverMoviesByGenre(settings, parsed.data.genreId)
        const enriched = await enrichCatalogListWithOmdb(settings, raw)
        const results = enriched.filter(shouldIncludeCatalogListItem)
        return { ok: true, results }
      } catch (e) {
        const m = mapCatalogError(e)
        return { ok: false, error: m.error, code: m.code }
      }
    }
  )

  ipcMain.handle('catalog:getMovie', async (_evt, raw: unknown): Promise<CatalogMovieResponse> => {
    const parsed = movieInput.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: 'Invalid movie id.', code: 'VALIDATION' }
    }
    const settings = getAppSettings()
    if (!hasTmdbCredentials(settings)) {
      return {
        ok: false,
        error: 'Add your TMDB credentials in Settings first.',
        code: 'NO_CREDENTIALS'
      }
    }
    try {
      const movie = await enrichMovieDetailsWithOmdb(
        settings,
        await getMovieDetails(settings, parsed.data.id)
      )
      return { ok: true, movie }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('TMDB_HTTP_404')) {
        return { ok: false, error: 'Movie not found.', code: 'NOT_FOUND' }
      }
      const m = mapCatalogError(e)
      return { ok: false, error: m.error, code: m.code }
    }
  })
}
