import { load } from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { TorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl, isValidMagnetUri } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { limitedFetch } from '../fetch-limited'

const BASE = 'https://uindex.org'
const PROVIDER = 'UIndex'

function parseRow($: ReturnType<typeof load>, el: AnyNode): TorrentSource | null {
  const row = $(el)
  const magnetUri = row.find('td.sr-col-name a.sr-magnet').first().attr('href') ?? ''
  if (!magnetUri || !isValidMagnetUri(magnetUri)) return null

  const nameAnchor = row.find('td.sr-col-name a.sr-torrent-link').first()
  const title = nameAnchor.text().trim()
  const href = nameAnchor.attr('href') ?? ''
  if (!title) return null

  const detailsPath = href.startsWith('/') ? href : `/${href}`
  const detailsUrl = `${BASE}${detailsPath}`
  if (!isSafeTorrentDetailsUrl(detailsUrl)) return null

  const size = row.find('td.sr-col-size').first().text().trim() || null
  const uploadDate = row.find('td.sr-col-uploaded').first().text().trim() || null

  const seedText = row.find('td.sr-col-seeders span').first().text().replace(/,/g, '').trim()
  const leechText = row.find('td.sr-col-leechers span').first().text().replace(/,/g, '').trim()
  const seeders = Number.parseInt(seedText, 10) || 0
  const leechers = Number.parseInt(leechText, 10) || 0

  return {
    title,
    providerName: PROVIDER,
    size,
    seeders,
    leechers,
    magnetUri,
    torrentFileUrl: null,
    detailsUrl,
    uploadDate
  }
}

/** HTML table search (movies category `c=1`). */
export async function searchUindex(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<TorrentSource[]> {
  const q = ctx.query.trim()
  if (!q) return []

  const url = `${BASE}/search.php?search=${encodeURIComponent(q)}&c=1`
  const res = await limitedFetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const html = await res.text()
  const $ = load(html)
  const tbody = $('table.sr-table > tbody').first()
  const out: TorrentSource[] = []
  tbody.children('tr').each((_, el) => {
    const parsed = parseRow($, el)
    if (parsed) out.push(parsed)
  })
  return out
}
