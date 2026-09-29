import { rewriteMediaUrls } from '../../src/shared/media-urls'

export function publicOrigin(): string {
  return (process.env.PUBLIC_ORIGIN ?? 'https://popcorn.josh.co.il').replace(/\/$/, '')
}

export function withPublicMedia<T>(payload: T): T {
  return rewriteMediaUrls(payload, publicOrigin())
}
