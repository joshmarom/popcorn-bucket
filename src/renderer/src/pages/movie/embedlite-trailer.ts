export function embedliteTrailerSrc(youtubeKey: string, displayTitle: string): string {
  const id = youtubeKey.trim()
  const base = `https://www.embedlite.com/embed/${encodeURIComponent(id)}`
  const t = displayTitle.trim().slice(0, 200)
  if (!t) return base
  return `${base}?title=${encodeURIComponent(t)}`
}
