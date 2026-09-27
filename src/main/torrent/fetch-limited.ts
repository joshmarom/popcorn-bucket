/** Simple per-host spacing so parallel scrapers do not hammer one origin. */
const lastByHost = new Map<string, number>()
const GAP_MS = 450

export async function limitedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { hostname } = new URL(url)
  const now = Date.now()
  const last = lastByHost.get(hostname) ?? 0
  const wait = Math.max(0, GAP_MS - (now - last))
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait))
  }
  lastByHost.set(hostname, Date.now())

  const headers = new Headers(init.headers)
  if (!headers.has('User-Agent')) {
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    )
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8')
  }

  return fetch(url, { ...init, headers })
}
