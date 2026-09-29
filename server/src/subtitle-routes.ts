import { Hono } from 'hono'
import { z } from 'zod'
import { fetchSubtitleContent } from '../../src/main/subtitles/opensubtitles'
import { serverSettings } from './secrets'

const searchBody = z.object({
  imdbId: z.string().min(1).max(20),
  language: z.string().min(2).max(16),
  movieHash: z.string().min(8).max(64).nullable().optional(),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().nonnegative().optional()
})

export function registerSubtitleRoutes(app: Hono): void {
  app.post('/v1/subtitles/search', async (c) => {
    const parsed = searchBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid subtitle search.' }, 400)
    const apiKey = serverSettings().openSubtitlesApiKey.trim()
    if (!apiKey) return c.json({ ok: false, error: 'OpenSubtitles is not configured.' }, 503)
    const { imdbId, language, movieHash, season, episode } = parsed.data
    const downloaded = await fetchSubtitleContent({
      apiKey,
      imdbId,
      language,
      movieHash: movieHash ?? null,
      ...(season != null && episode != null ? { episode: { season, episode } } : {})
    })
    if (!downloaded) return c.json({ ok: false, error: 'No subtitle found.' })
    return c.json({
      ok: true,
      fileId: downloaded.fileId,
      language,
      content: downloaded.content
    })
  })
}
