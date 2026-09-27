/**
 * When the app is opened as `http://127.0.0.1:…` vs `http://localhost:…`, loopback
 * stream URLs from main must use the same hostname to avoid cross-origin + PNA issues.
 */
export function alignLoopbackStreamUrlToPageHost(url: string): string {
  if (typeof window === 'undefined') return url
  try {
    const u = new URL(url)
    const streamHost = u.hostname.toLowerCase()
    const pageHost = window.location.hostname.toLowerCase()
    const streamIsLoopback = streamHost === 'localhost' || streamHost === '127.0.0.1'
    const pageIsLoopback = pageHost === 'localhost' || pageHost === '127.0.0.1'
    if (streamIsLoopback && pageIsLoopback && streamHost !== pageHost) {
      u.hostname = window.location.hostname
      return u.toString()
    }
  } catch {
    /* ignore */
  }
  return url
}
