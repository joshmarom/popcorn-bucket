export async function loadPosterUrls(signal?: AbortSignal): Promise<string[]> {
  const lists = await Promise.all(
    [
      '/v1/catalog/trending?page=1',
      '/v1/tv/trending?page=1',
      '/v1/catalog/trending?page=2',
      '/v1/tv/trending?page=2'
    ].map((path) => readPosters(path, signal).catch(() => [] as string[]))
  )
  return [...new Set(interleave(lists))].map(smallPoster)
}

async function readPosters(path: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(path, { signal })
  if (!response.ok) return []
  const body = (await response.json()) as {
    ok?: boolean
    results?: { posterUrl?: string | null }[]
  }
  if (!body.ok || !Array.isArray(body.results)) return []
  return body.results.map((item) => item.posterUrl?.trim() ?? '').filter((url) => url.length > 0)
}

/** Wall tiles are under 200 CSS pixels wide, so w342 covers 2x screens. */
function smallPoster(url: string): string {
  return url.replace('/poster/w500/', '/poster/w342/').replace('/poster/original/', '/poster/w342/')
}

function interleave(lists: string[][]): string[] {
  const out: string[] = []
  const longest = Math.max(0, ...lists.map((list) => list.length))
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const url = list[index]
      if (url) out.push(url)
    }
  }
  return out
}
