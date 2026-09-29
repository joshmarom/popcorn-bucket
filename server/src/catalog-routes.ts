import { Hono } from 'hono'
import { z } from 'zod'
import type { CatalogErrorCode } from '../../src/shared/catalog'
import { shouldIncludeCatalogListItem } from '../../src/shared/catalog'
import { STREAMING_SERVICES, type StreamingService } from '../../src/shared/discovery'
import { fillCatalogMovieListFacts } from '../../src/main/catalog-list-facts'
import { getLibrary } from '../../src/main/library/db'
import { rankMovies } from '../../src/main/library/ranked-lists'
import { enrichCatalogListWithOmdb, enrichMovieDetailsWithOmdb } from '../../src/main/omdb'
import {
  discoverMoviesByGenre,
  discoverMoviesByGenreFirstPage,
  getMovieDetails,
  getMovieGenres,
  hasTmdbCredentials,
  searchMovies
} from '../../src/main/tmdb'
import {
  getOnTheAirShows,
  getTvGenres,
  getTvSeason,
  getTvShowDetails,
  searchTvShows,
  searchTvShowsAll
} from '../../src/main/tmdb-tv'
import { getTrendingPage } from '../../src/main/torrent/trending-watchable'
import { getTrendingTvPage } from '../../src/main/torrent/trending-tv'
import { configureTorrentClaw } from '../../src/main/torrentclaw/client'
import {
  autocomplete,
  getCollection,
  getCollections,
  getPopularMovies,
  getPopularShows,
  getStreamingTop,
  getStreamingTopShows,
  getUpcomingMovies,
  resolveSuggestionTmdbId
} from '../../src/main/torrentclaw/discovery'
import { getTvGenrePage, getTvGenreRails } from '../../src/main/tv-genres'
import { fillTvShowListFacts } from '../../src/main/tv-list-facts'
import { serverSettings } from './secrets'

configureTorrentClaw({
  getApiKey: () => serverSettings().torrentClawApiKey
})

const searchInput = z.object({ query: z.string().min(1).max(200) })
const optionalPage = z
  .string()
  .optional()
  .transform((value) => (value ? Number(value) : undefined))
  .pipe(z.number().int().positive().max(5000).optional())
const pageInput = z.object({
  page: optionalPage,
  forceRefresh: z.string().optional()
})
const idInput = z.object({ id: z.coerce.number().int().positive() })
const genreInput = z.object({ genreId: z.coerce.number().int().positive() })
const tvGenreInput = z.object({
  genreId: z.coerce.number().int().positive(),
  page: optionalPage
})
const idsInput = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').filter(Boolean).map(Number))
    .pipe(z.array(z.number().int().positive()).max(40))
})
const streamingInput = z.object({
  service: z.enum(STREAMING_SERVICES.map((service) => service.id) as [StreamingService, ...StreamingService[]])
})
const autocompleteInput = z.object({ q: z.string().trim().min(2).max(100) })
const resolveInput = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(400),
  year: z.number().int().nullable(),
  contentType: z.enum(['movie', 'show', 'collection'])
})
const seasonInput = z.object({
  showId: z.coerce.number().int().positive(),
  seasonNumber: z.coerce.number().int().min(0).max(200)
})

export function registerCatalogRoutes(app: Hono): void {
  app.get('/v1/catalog/search', async (c) => {
    const parsed = searchInput.safeParse({ query: c.req.query('query') ?? '' })
    if (!parsed.success) return c.json(invalid('Enter a search query.'))
    const settings = serverSettings()
    if (!hasTmdbCredentials(settings)) return c.json(noCredentials())
    try {
      const found = await searchMovies(settings, parsed.data.query)
      const enriched = await enrichCatalogListWithOmdb(settings, found)
      return c.json({ ok: true, results: enriched.filter(shouldIncludeCatalogListItem) })
    } catch (error) {
      return c.json(mapCatalogError(error))
    }
  })

  app.get('/v1/catalog/trending', async (c) => {
    const parsed = pageInput.safeParse({
      page: c.req.query('page'),
      forceRefresh: c.req.query('forceRefresh')
    })
    if (!parsed.success) return c.json(invalid('Invalid page.'))
    const settings = serverSettings()
    if (!hasTmdbCredentials(settings)) return c.json(noCredentials())
    try {
      const page = await getTrendingPage(settings, parsed.data.page ?? 1, {
        forceRefresh: parsed.data.forceRefresh === '1' || parsed.data.forceRefresh === 'true'
      })
      return c.json({ ok: true, ...page })
    } catch (error) {
      return c.json(mapCatalogError(error))
    }
  })

  app.get('/v1/catalog/movies/:id', async (c) => {
    const parsed = idInput.safeParse({ id: c.req.param('id') })
    if (!parsed.success) return c.json(invalid('Invalid movie id.'))
    const settings = serverSettings()
    if (!hasTmdbCredentials(settings)) return c.json(noCredentials())
    try {
      const movie = await enrichMovieDetailsWithOmdb(
        settings,
        await getMovieDetails(settings, parsed.data.id)
      )
      return c.json({ ok: true, movie })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('TMDB_HTTP_404')) {
        return c.json({ ok: false, error: 'Movie not found.', code: 'NOT_FOUND' })
      }
      return c.json(mapCatalogError(error))
    }
  })

  app.get('/v1/catalog/genre-rails', async (c) => {
    const settings = serverSettings()
    if (!hasTmdbCredentials(settings)) return c.json(noCredentials())
    try {
      const genres = await getMovieGenres(settings)
      const rails = []
      for (const genre of genres) {
        await discoverMoviesByGenreFirstPage(settings, genre.id)
        const movies = rankMovies(getLibrary(), { genreId: genre.id, limit: 45 })
          .filter(shouldIncludeCatalogListItem)
          .slice(0, 15)
        if (movies.length === 0) continue
        rails.push({ genre, movies })
      }
      return c.json({ ok: true, rails })
    } catch (error) {
      return c.json(mapCatalogError(error))
    }
  })

  app.get('/v1/catalog/discover', async (c) => {
    const parsed = genreInput.safeParse({ genreId: c.req.query('genreId') })
    if (!parsed.success) return c.json(invalid('Invalid genre.'))
    const settings = serverSettings()
    if (!hasTmdbCredentials(settings)) return c.json(noCredentials())
    try {
      await getMovieGenres(settings)
      await discoverMoviesByGenre(settings, parsed.data.genreId)
      const ranked = rankMovies(getLibrary(), { genreId: parsed.data.genreId, limit: 300 })
      const enriched = await enrichCatalogListWithOmdb(settings, ranked)
      return c.json({ ok: true, results: enriched.filter(shouldIncludeCatalogListItem) })
    } catch (error) {
      return c.json(mapCatalogError(error))
    }
  })

  app.get('/v1/catalog/list-facts', async (c) => {
    const parsed = idsInput.safeParse({ ids: c.req.query('ids') ?? '' })
    if (!parsed.success) return c.json(invalid('Invalid movie ids.'))
    try {
      const facts = await fillCatalogMovieListFacts(serverSettings(), parsed.data.ids)
      return c.json({ ok: true, facts })
    } catch (error) {
      return c.json(mapCatalogError(error))
    }
  })

  app.get('/v1/tv/search', async (c) => {
    const parsed = searchInput
      .extend({ page: optionalPage })
      .safeParse({ query: c.req.query('query') ?? '', page: c.req.query('page') })
    if (!parsed.success) return c.json({ ok: false, error: 'Enter a search query.' })
    try {
      return c.json({
        ok: true,
        ...(await searchTvShows(serverSettings(), parsed.data.query, parsed.data.page ?? 1))
      })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/search-all', async (c) => {
    const parsed = searchInput.safeParse({ query: c.req.query('query') ?? '' })
    if (!parsed.success) return c.json({ ok: false, error: 'Enter a search query.' })
    try {
      return c.json({ ok: true, results: await searchTvShowsAll(serverSettings(), parsed.data.query) })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/trending', async (c) => {
    const parsed = pageInput.safeParse({
      page: c.req.query('page'),
      forceRefresh: c.req.query('forceRefresh')
    })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid page.' })
    try {
      const page = await getTrendingTvPage(serverSettings(), parsed.data.page ?? 1, {
        forceRefresh: parsed.data.forceRefresh === '1' || parsed.data.forceRefresh === 'true'
      })
      return c.json({ ok: true, ...page })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/shows/:id', async (c) => {
    const parsed = idInput.safeParse({ id: c.req.param('id') })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid show id.' })
    try {
      return c.json({ ok: true, show: await getTvShowDetails(serverSettings(), parsed.data.id) })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/shows/:id/seasons/:season', async (c) => {
    const parsed = seasonInput.safeParse({
      showId: c.req.param('id'),
      seasonNumber: c.req.param('season')
    })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid season.' })
    try {
      return c.json({
        ok: true,
        season: await getTvSeason(serverSettings(), parsed.data.showId, parsed.data.seasonNumber)
      })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/genre-rails', async (c) => {
    try {
      return c.json({ ok: true, rails: await getTvGenreRails(serverSettings()) })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/genres', async (c) => {
    try {
      return c.json(await getTvGenres(serverSettings()))
    } catch {
      return c.json([])
    }
  })

  app.get('/v1/tv/on-the-air', async (c) => {
    try {
      return c.json({ ok: true, results: await getOnTheAirShows(serverSettings()) })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/discover', async (c) => {
    const parsed = tvGenreInput.safeParse({
      genreId: c.req.query('genreId'),
      page: c.req.query('page')
    })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid genre.' })
    try {
      const page = await getTvGenrePage(
        serverSettings(),
        parsed.data.genreId,
        parsed.data.page ?? 1
      )
      return c.json({ ok: true, ...page })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/tv/list-facts', async (c) => {
    const parsed = idsInput.safeParse({ ids: c.req.query('ids') ?? '' })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid show ids.' })
    try {
      return c.json({
        ok: true,
        facts: await fillTvShowListFacts(serverSettings(), parsed.data.ids)
      })
    } catch (error) {
      return c.json({ ok: false, error: mapCatalogError(error).error })
    }
  })

  app.get('/v1/discover/popular', async (c) => {
    try {
      return c.json({ ok: true, items: await getPopularMovies() })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/popular-shows', async (c) => {
    try {
      return c.json({ ok: true, items: await getPopularShows() })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/upcoming', async (c) => {
    try {
      return c.json({ ok: true, items: await getUpcomingMovies() })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/streaming-top', async (c) => {
    const parsed = streamingInput.safeParse({ service: c.req.query('service') })
    if (!parsed.success) return c.json({ ok: false, error: 'Unknown streaming service.' })
    try {
      return c.json({ ok: true, items: await getStreamingTop(parsed.data.service) })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/streaming-top-shows', async (c) => {
    const parsed = streamingInput.safeParse({ service: c.req.query('service') })
    if (!parsed.success) return c.json({ ok: false, error: 'Unknown streaming service.' })
    try {
      return c.json({ ok: true, items: await getStreamingTopShows(parsed.data.service) })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/collections', async (c) => {
    try {
      return c.json({ ok: true, collections: await getCollections() })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/collections/:id', async (c) => {
    const parsed = idInput.safeParse({ id: c.req.param('id') })
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid collection id.' })
    try {
      return c.json({ ok: true, ...(await getCollection(parsed.data.id)) })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.get('/v1/discover/autocomplete', async (c) => {
    const parsed = autocompleteInput.safeParse({ q: c.req.query('q') ?? '' })
    if (!parsed.success) return c.json({ ok: true, suggestions: [] })
    try {
      return c.json({ ok: true, suggestions: await autocomplete(parsed.data.q) })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })

  app.post('/v1/discover/resolve', async (c) => {
    const parsed = resolveInput.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid suggestion.' })
    const suggestion = parsed.data
    if (suggestion.contentType === 'collection') {
      return c.json({ ok: true, route: `/collection/${suggestion.id}` })
    }
    try {
      const tmdbId = await resolveSuggestionTmdbId({
        ...suggestion,
        contentType: suggestion.contentType
      })
      if (tmdbId == null) return c.json({ ok: false, error: 'No TMDB match.' })
      return c.json({
        ok: true,
        route: suggestion.contentType === 'show' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`
      })
    } catch (error) {
      return c.json({ ok: false, error: discoverError(error) })
    }
  })
}

function noCredentials(): { ok: false; error: string; code: CatalogErrorCode } {
  return {
    ok: false,
    error: 'Add your TMDB credentials in Settings first.',
    code: 'NO_CREDENTIALS'
  }
}

function invalid(error: string): { ok: false; error: string; code: CatalogErrorCode } {
  return { ok: false, error, code: 'VALIDATION' }
}

function discoverError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'TorrentClaw is unavailable.'
}

function mapCatalogError(error: unknown): { ok: false; error: string; code: CatalogErrorCode } {
  if (error instanceof z.ZodError) return invalid('Invalid request')
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'NO_CREDENTIALS') {
    return {
      ok: false,
      error: 'Add your TMDB Read Access Token or API key in Settings.',
      code: 'NO_CREDENTIALS'
    }
  }
  if (message.startsWith('TMDB_HTTP_')) {
    return { ok: false, error: `TMDB request failed (${message.slice(0, 80)})`, code: 'BAD_RESPONSE' }
  }
  if (message === 'BAD_RESPONSE') {
    return { ok: false, error: 'Unexpected response from TMDB.', code: 'BAD_RESPONSE' }
  }
  return { ok: false, error: message || 'Unknown error', code: 'NETWORK' }
}
