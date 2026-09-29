import { Hono } from 'hono'
import { handleMediaRequest } from './media-store'

export function registerMediaRoutes(app: Hono): void {
  app.get('/media/tmdb/:kind/:size/:file', (c) => handleMediaRequest(c))
}
