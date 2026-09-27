import { PUBLIC_TRACKERS } from './public-trackers'

/** Build a magnet URI from a 40-char hex info-hash (any case), with public trackers attached. */
export function magnetFromInfoHash(title: string, infoHashHex: string): string | null {
  const h = infoHashHex.replace(/[^a-fA-F0-9]/g, '').toLowerCase()
  if (h.length !== 40) return null
  const trackers = PUBLIC_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${h}&dn=${encodeURIComponent(title)}${trackers}`
}
