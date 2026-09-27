import { load } from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { TorrentSource } from '@shared/torrent'
import { isSafeTorrentDetailsUrl } from '@shared/torrent'
import type { TorrentProviderContext } from '../provider-context'
import { magnetFromInfoHash } from '../magnet-from-hash'
import { limitedFetch } from '../fetch-limited'

const BASE = 'https://limetorrents.lol'
const PROVIDER = 'LimeTorrents'
const INFO_HASH_REGEX = /\/torrent\/([A-Fa-f0-9]{40})\.torrent/

function parseTorrentRow($: ReturnType<typeof load>, el: AnyNode): TorrentSource | null {
  const row = $(el)
  const nameAnchor = row.find('div.tt-name > a[href^="/"]').first()
  const href = nameAnchor.attr('href')
  if (!href) return null
  const title = nameAnchor.text().trim()
  if (!title) return null

  const detailsPath = href.startsWith('/') ? href : `/${href}`
  const detailsUrl = `${BASE}${detailsPath}`
  if (!isSafeTorrentDetailsUrl(detailsUrl)) return null

  let hashHref = ''
  for (const node of row.find('a[class^="csprite"]').toArray()) {
    const h = $(node).attr('href')
    if (h?.startsWith('http') && h.includes('/torrent/')) {
      hashHref = h
      break
    }
  }
  const hashMatch = hashHref ? INFO_HASH_REGEX.exec(hashHref) : null
  if (!hashMatch?.[1]) return null

  const size = row.find('td').eq(2).text().trim() || null
  const seeders = Number.parseInt(row.find('.tdseed').first().text().trim(), 10) || 0
  const leechers = Number.parseInt(row.find('.tdleech').first().text().trim(), 10) || 0
  const uploadRaw = row.find('td').eq(1).text().trim()
  const uploadDate = uploadRaw ? (uploadRaw.split(' -')[0]?.trim() ?? null) : null

  let torrentFileUrl: string | null = null
  for (const node of row.find('a[href^="http"]').toArray()) {
    const u = $(node).attr('href') ?? ''
    if (/\.torrent($|\?)/i.test(u) && isSafeTorrentDetailsUrl(u)) {
      torrentFileUrl = u
      break
    }
  }

  const magnetUri = magnetFromInfoHash(title, hashMatch[1])
  if (!magnetUri) return null

  return {
    title,
    providerName: PROVIDER,
    size,
    seeders,
    leechers,
    magnetUri,
    torrentFileUrl,
    detailsUrl,
    uploadDate
  }
}

/**
 * Parses LimeTorrents HTML search (movies category). Markup can change — treat as best-effort.
 */
export async function searchLimeTorrents(
  ctx: TorrentProviderContext,
  signal: AbortSignal
): Promise<TorrentSource[]> {
  const q = ctx.query.trim()
  if (!q) return []

  const pathSeg = encodeURIComponent(q).replace(/%20/g, '+')
  const url = `${BASE}/search/movies/${pathSeg}/date/1/`

  const res = await limitedFetch(url, { signal })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const html = await res.text()
  const $ = load(html)
  const rows = $('.table2 > tbody > tr[bgcolor]')
  const out: TorrentSource[] = []
  rows.each((_, el) => {
    const parsed = parseTorrentRow($, el)
    if (parsed) out.push(parsed)
  })
  return out
}
