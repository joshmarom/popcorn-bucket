/** Passed to every torrent provider (HTML or JSON). */
export type TorrentProviderContext = {
  /** Space-separated title + year etc., built in the orchestrator. */
  query: string
  /** Normalized `tt…` id when known (e.g. for YTS). */
  imdbId: string | null
}

export function normalizeImdbId(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  const t = String(raw).trim()
  if (/^tt\d+$/i.test(t)) return t.toLowerCase()
  if (/^\d{6,}$/.test(t)) return `tt${t}`
  return null
}
