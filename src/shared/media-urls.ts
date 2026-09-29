export const MEDIA_KINDS = ['poster', 'backdrop', 'still', 'profile'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export const MEDIA_SIZES = [
  'w92',
  'w154',
  'w185',
  'w300',
  'w342',
  'w500',
  'w780',
  'w1280',
  'original'
] as const
export type MediaSize = (typeof MEDIA_SIZES)[number]

const TMDB_FILE = /^\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i

export type ParsedTmdbImage = {
  kind: MediaKind
  size: MediaSize
  filePath: string
}

function isMediaSize(value: string): value is MediaSize {
  return (MEDIA_SIZES as readonly string[]).includes(value)
}

function isMediaKind(value: string): value is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(value)
}

export function normalizeTmdbFilePath(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const file = withSlash.replace(/^\/+/, '/')
  return TMDB_FILE.test(file) ? file : null
}

function kindForSize(size: MediaSize, hint?: MediaKind): MediaKind {
  if (hint) return hint
  if (size === 'w1280' || size === 'w780') return 'backdrop'
  if (size === 'w300') return 'still'
  if (size === 'w92') return 'profile'
  return 'poster'
}

/** Pull a TMDB file path (and size) out of TMDB, TorrentClaw, or our own /media URLs. */
export function parseTmdbImageUrl(url: string, kindHint?: MediaKind): ParsedTmdbImage | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed, 'https://popcorn.josh.co.il')
  } catch {
    return null
  }
  const path = parsed.pathname

  const own = /\/media\/tmdb\/([^/]+)\/([^/]+)(\/[^/]+)$/.exec(path)
  if (own && isMediaKind(own[1] ?? '') && isMediaSize(own[2] ?? '')) {
    const filePath = normalizeTmdbFilePath(own[3] ?? '')
    if (!filePath) return null
    return { kind: own[1] as MediaKind, size: own[2] as MediaSize, filePath }
  }

  const tmdbish =
    /\/t\/p\/(w\d+|original)(\/[^/]+)$/.exec(path) ??
    /\/api\/poster\/t\/p\/(w\d+|original)(\/[^/]+)$/.exec(path)
  if (tmdbish) {
    const sizeRaw = tmdbish[1] ?? ''
    const filePath = normalizeTmdbFilePath(tmdbish[2] ?? '')
    if (!filePath || !isMediaSize(sizeRaw)) return null
    return { kind: kindForSize(sizeRaw, kindHint), size: sizeRaw, filePath }
  }

  return null
}

export function tmdbCdnUrl(size: MediaSize, filePath: string): string {
  return `https://image.tmdb.org/t/p/${size}${filePath}`
}

export function torrentClawCdnUrl(size: MediaSize, filePath: string): string {
  return `https://img.torrentclaw.com/t/p/${size}${filePath}`
}

export function torrentClawPosterProxyUrl(size: MediaSize, filePath: string): string {
  return `https://torrentclaw.com/api/poster/t/p/${size}${filePath}`
}

export function publicMediaPath(image: ParsedTmdbImage): string {
  return `/media/tmdb/${image.kind}/${image.size}${image.filePath}`
}

export function publicMediaUrl(origin: string, image: ParsedTmdbImage): string {
  return `${origin.replace(/\/$/, '')}${publicMediaPath(image)}`
}

const MEDIA_URL_KEYS = new Set([
  'posterUrl',
  'backdropUrl',
  'profileUrl',
  'stillUrl',
  'localPosterUrl'
])

function kindHintForKey(key: string): MediaKind | undefined {
  if (key === 'posterUrl' || key === 'localPosterUrl') return 'poster'
  if (key === 'backdropUrl') return 'backdrop'
  if (key === 'profileUrl') return 'profile'
  if (key === 'stillUrl') return 'still'
  return undefined
}

function rewriteOne(origin: string, url: string, hint?: MediaKind): string {
  const parsed = parseTmdbImageUrl(url, hint)
  return parsed ? publicMediaUrl(origin, parsed) : url
}

/** Rewrite TMDB / TorrentClaw image fields in API JSON to our public /media URLs. */
export function rewriteMediaUrls<T>(value: T, origin: string): T {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => rewriteMediaUrls(item, origin)) as T
  }
  if (value == null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'backdropUrls' && Array.isArray(child)) {
      out[key] = child.map((item) =>
        typeof item === 'string' ? rewriteOne(origin, item, 'backdrop') : item
      )
      continue
    }
    if (MEDIA_URL_KEYS.has(key) && typeof child === 'string') {
      out[key] = rewriteOne(origin, child, kindHintForKey(key))
      continue
    }
    out[key] = rewriteMediaUrls(child, origin)
  }
  return out as T
}
