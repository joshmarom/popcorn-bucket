export type SiteDownloadAsset = {
  os: 'mac' | 'windows' | 'linux'
  label: string
  name: string
  url: string
  size: number
}

export type SiteDownloads =
  | { ok: true; version: string; assets: SiteDownloadAsset[] }
  | { ok: false; error: string }

type GithubAsset = {
  name?: string
  browser_download_url?: string
  size?: number
}

type GithubRelease = {
  tag_name?: string
  name?: string
  assets?: GithubAsset[]
}

const CACHE_MS = 15 * 60 * 1000
const FAILURE_CACHE_MS = 60 * 1000
const RELEASE_URL = 'https://api.github.com/repos/joshmarom/popcorn-bucket/releases/latest'

let cache: { at: number; ttl: number; body: SiteDownloads } | null = null

export function mapGithubRelease(release: GithubRelease): SiteDownloads {
  const assets = (release.assets ?? [])
    .map(classifyAsset)
    .filter((asset): asset is SiteDownloadAsset => asset !== null)
    .sort((a, b) => rank(a.name) - rank(b.name))
  const version = (release.tag_name || release.name || '').replace(/^v/, '')
  if (!version && assets.length === 0) {
    return { ok: false, error: 'No release found.' }
  }
  return { ok: true, version: version || 'latest', assets }
}

export async function loadSiteDownloads(now = Date.now()): Promise<SiteDownloads> {
  if (cache && now - cache.at < cache.ttl) return cache.body
  try {
    const response = await fetch(RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'popcorn-bucket-site'
      }
    })
    if (!response.ok) return rememberFailure(now)
    const body = mapGithubRelease((await response.json()) as GithubRelease)
    cache = { at: now, ttl: body.ok ? CACHE_MS : FAILURE_CACHE_MS, body }
    return body
  } catch {
    return rememberFailure(now)
  }
}

function rememberFailure(now: number): SiteDownloads {
  const body: SiteDownloads = { ok: false, error: 'GitHub releases are unavailable.' }
  cache = { at: now, ttl: FAILURE_CACHE_MS, body }
  return body
}

function classifyAsset(asset: GithubAsset): SiteDownloadAsset | null {
  const name = asset.name ?? ''
  const url = asset.browser_download_url ?? ''
  if (!name || !url) return null
  const kind = kindForName(name)
  if (!kind) return null
  return { ...kind, name, url, size: typeof asset.size === 'number' ? asset.size : 0 }
}

function kindForName(name: string): { os: SiteDownloadAsset['os']; label: string } | null {
  if (name.endsWith('-setup.exe')) return { os: 'windows', label: 'Windows' }
  if (name.endsWith('.dmg')) return { os: 'mac', label: 'macOS' }
  if (name.endsWith('.AppImage')) return { os: 'linux', label: 'Linux AppImage' }
  if (name.endsWith('.deb')) return { os: 'linux', label: 'Linux (.deb)' }
  if (name.endsWith('.snap')) return { os: 'linux', label: 'Linux (snap)' }
  return null
}

function rank(name: string): number {
  if (name.endsWith('.dmg')) return 0
  if (name.endsWith('-setup.exe')) return 1
  if (name.endsWith('.AppImage')) return 2
  if (name.endsWith('.deb')) return 3
  if (name.endsWith('.snap')) return 4
  return 5
}
