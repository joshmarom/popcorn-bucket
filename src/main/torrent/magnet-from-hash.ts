/** Build a magnet URI from a 40-char hex info-hash (any case). */
export function magnetFromInfoHash(title: string, infoHashHex: string): string | null {
  const h = infoHashHex.replace(/[^a-fA-F0-9]/g, '').toLowerCase()
  if (h.length !== 40) return null
  return `magnet:?xt=urn:btih:${h}&dn=${encodeURIComponent(title)}`
}
