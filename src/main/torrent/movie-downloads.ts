import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isValidMagnetUri } from '@shared/torrent'
import type {
  AddMovieTorrentPayload,
  AddMovieTorrentResponse,
  MovieTorrentDownloadSnapshot,
  MovieTorrentFileProgress
} from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse, TorrentSubtitleTrack } from '@shared/torrent-stream'
import {
  baseDownloadDir,
  buildStreamUrl,
  ensureHttpServer,
  getClientIfExists,
  getReadyClient,
  listTorrentSidecarSubtitles,
  pickPlayableFile,
  playbackReadyBytes,
  shutdownWebTorrentCore,
  type WtFile,
  type WtTorrent
} from './webtorrent-core'
import {
  loadPersistedMovieDownloads,
  savePersistedMovieDownloads,
  type PersistedDownloadCompleteSummary,
  type PersistedMovieDownload
} from './movie-downloads-persistence'
import { shutdownCurrentMpvSession, startExternalMpvSession } from './mpv-controller'

/** Containers Chromium refuses to play inline; we hand these off to mpv. */
const EXTERNAL_CONTAINER_RE = /\.(mkv|matroska|avi|ts|m2ts|mpg|mpeg|wmv|flv|vob)$/i

function needsExternalPlayer(fileName: string): boolean {
  return EXTERNAL_CONTAINER_RE.test(fileName.trim())
}

type DownloadRecord = {
  id: string
  movieId: number
  magnetUri: string
  displayTitle: string
  indexerSeeders: number
  indexerLeechers: number
  createdAt: number
  wt: WtTorrent | null
  playFile: WtFile | null
  status: MovieTorrentDownloadSnapshot['status']
  errorMessage?: string
  /** Saved when a download reaches 100% (for list UI after restart or client teardown). */
  completeSnapshot?: PersistedDownloadCompleteSummary
  /** Restored from disk: prefer this video path after metadata arrives. */
  resumedPlayFilePath?: string | null
  /** Restored from disk: pause swarm after metadata if still in progress. */
  resumedPaused?: boolean
}

const records = new Map<string, DownloadRecord>()

let persistTimer: ReturnType<typeof setTimeout> | null = null

function captureCompleteSnapshot(rec: DownloadRecord, torrent: WtTorrent): void {
  rec.completeSnapshot = {
    totalBytes: torrent.length ?? 0,
    downloaded: torrent.downloaded ?? 0,
    progress:
      typeof torrent.progress === 'number' && Number.isFinite(torrent.progress)
        ? Math.min(1, Math.max(0, torrent.progress))
        : 1,
    torrentName: torrent.name ?? null,
    playFileLabel: rec.playFile?.name ?? null
  }
}

function serializeRecord(rec: DownloadRecord): PersistedMovieDownload {
  const t = rec.wt
  const paused = Boolean(t && !t.destroyed && t.paused)
  let completeSummary: PersistedDownloadCompleteSummary | undefined
  if (rec.completeSnapshot) {
    completeSummary = { ...rec.completeSnapshot }
  }
  if (t && !t.destroyed && t.ready && t.done) {
    completeSummary = {
      totalBytes: t.length ?? 0,
      downloaded: t.downloaded ?? 0,
      progress:
        typeof t.progress === 'number' && Number.isFinite(t.progress)
          ? Math.min(1, Math.max(0, t.progress))
          : 1,
      torrentName: t.name ?? null,
      playFileLabel: rec.playFile?.name ?? null
    }
  }
  return {
    id: rec.id,
    movieId: rec.movieId,
    magnetUri: rec.magnetUri,
    displayTitle: rec.displayTitle,
    indexerSeeders: rec.indexerSeeders,
    indexerLeechers: rec.indexerLeechers,
    createdAt: rec.createdAt,
    playFilePath: rec.playFile?.path ?? null,
    paused,
    completed: rec.status === 'complete',
    completeSummary
  }
}

function schedulePersistMovieDownloads(): void {
  if (persistTimer != null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const rows = [...records.values()].map(serializeRecord)
    rows.sort((a, b) => b.createdAt - a.createdAt)
    savePersistedMovieDownloads(rows)
  }, 450)
}

/** Synchronous save — call before process exit / shutdown. */
export function flushMovieDownloadsPersistence(): void {
  if (persistTimer != null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const rows = [...records.values()].map(serializeRecord)
  rows.sort((a, b) => b.createdAt - a.createdAt)
  savePersistedMovieDownloads(rows)
}

export function restoreMovieDownloadsOnStartup(): void {
  const rows = loadPersistedMovieDownloads()
  const seenMagnets = new Set<string>()
  for (const row of rows) {
    if (!isValidMagnetUri(row.magnetUri)) continue
    const mKey = `${row.movieId}:${normalizeMagnet(row.magnetUri)}`
    if (seenMagnets.has(mKey)) continue
    seenMagnets.add(mKey)
    if (records.has(row.id)) continue
    const rec: DownloadRecord = {
      id: row.id,
      movieId: row.movieId,
      magnetUri: row.magnetUri.trim(),
      displayTitle: row.displayTitle.trim() || 'Torrent',
      indexerSeeders: row.indexerSeeders,
      indexerLeechers: row.indexerLeechers,
      createdAt: row.createdAt,
      wt: null,
      playFile: null,
      status: row.completed ? 'complete' : 'pending_metadata',
      completeSnapshot: row.completeSummary,
      resumedPlayFilePath: row.playFilePath ? row.playFilePath : undefined,
      resumedPaused: row.completed ? false : row.paused
    }
    records.set(rec.id, rec)
    void attachTorrent(rec)
  }
}

function normalizeMagnet(m: string): string {
  return m.trim().toLowerCase()
}

/** Strip extension and tidy dots/underscores for UI labels. */
function subtitleTrackLabel(filename: string): string {
  const base = filename
    .replace(/\.[^.]+$/i, '')
    .replace(/[._]+/g, ' ')
    .trim()
  return base.length > 0 ? base : filename
}

/** Guess a short language tag from common filename patterns (e.g. `movie.en.srt`). */
function guessSubtitleLanguage(filename: string): string | undefined {
  const lower = filename.toLowerCase()
  const beforeExt = lower.replace(/\.(srt|vtt|ssa|ass)$/i, '')
  const two = beforeExt.match(/[._-]([a-z]{2})(?:[._-]|$)/)
  if (two) return two[1]
  const three = beforeExt.match(/[._-]([a-z]{3})(?:[._-]|$)/)
  if (three) {
    const t = three[1]
    const map: Record<string, string> = {
      eng: 'en',
      spa: 'es',
      fre: 'fr',
      fra: 'fr',
      deu: 'de',
      ger: 'de',
      ita: 'it',
      por: 'pt',
      jpn: 'ja',
      kor: 'ko',
      zho: 'zh',
      chi: 'zh'
    }
    return map[t] ?? undefined
  }
  return undefined
}

async function removeTorrentFromClient(torrent: WtTorrent): Promise<void> {
  const c = getClientIfExists()
  if (!c || torrent.destroyed) return
  await c.remove(torrent, { destroyStore: true }).catch(() => {})
}

function mapFileProgress(t: WtTorrent): MovieTorrentFileProgress[] {
  if (!t.files?.length) return []
  return t.files.map((f) => ({
    path: f.path,
    length: f.length,
    downloaded: f.downloaded,
    progress: f.length > 0 ? f.downloaded / f.length : 0
  }))
}

function buildSnapshot(rec: DownloadRecord): MovieTorrentDownloadSnapshot {
  const base: MovieTorrentDownloadSnapshot = {
    downloadId: rec.id,
    movieId: rec.movieId,
    magnetUri: rec.magnetUri,
    displayTitle: rec.displayTitle,
    status: rec.status,
    errorMessage: rec.errorMessage,
    torrentName: null,
    indexerSeeders: rec.indexerSeeders,
    indexerLeechers: rec.indexerLeechers,
    numPeers: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    downloaded: 0,
    totalBytes: 0,
    progress: 0,
    canPlay: false,
    files: [],
    playFileLabel: rec.playFile?.name ?? null
  }

  if (rec.status === 'error') {
    const errT = rec.wt
    if (errT && !errT.destroyed && errT.ready) {
      base.files = mapFileProgress(errT)
      base.torrentName = errT.name ?? null
    }
    return base
  }

  const t = rec.wt
  if (!t) {
    if (rec.status === 'pending_metadata') {
      return { ...base, status: 'pending_metadata' }
    }
    if (rec.status === 'complete') {
      const s = rec.completeSnapshot
      if (s) {
        return {
          ...base,
          status: 'complete',
          torrentName: s.torrentName,
          downloaded: s.downloaded,
          totalBytes: s.totalBytes,
          progress: s.progress,
          canPlay: true,
          playFileLabel: s.playFileLabel ?? base.playFileLabel
        }
      }
      return { ...base, status: 'complete', canPlay: true }
    }
    return {
      ...base,
      status: 'error',
      errorMessage: rec.errorMessage ?? 'Torrent unavailable.'
    }
  }

  if (t.destroyed) {
    if (rec.status === 'complete') {
      const s = rec.completeSnapshot
      if (s) {
        return {
          ...base,
          status: 'complete',
          torrentName: s.torrentName,
          downloaded: s.downloaded,
          totalBytes: s.totalBytes,
          progress: s.progress,
          canPlay: true,
          playFileLabel: s.playFileLabel ?? base.playFileLabel
        }
      }
      return { ...base, status: 'complete', canPlay: true }
    }
    return {
      ...base,
      status: 'error',
      errorMessage: rec.errorMessage ?? 'Torrent was removed.'
    }
  }

  base.torrentName = t.name ?? null

  if (!t.ready) {
    return { ...base, status: 'pending_metadata' }
  }

  base.files = mapFileProgress(t)
  base.numPeers = t.numPeers ?? 0
  base.downloadSpeed = t.paused ? 0 : (t.downloadSpeed ?? 0)
  base.uploadSpeed = t.paused ? 0 : (t.uploadSpeed ?? 0)
  base.downloaded = t.downloaded ?? 0
  base.totalBytes = t.length ?? 0
  base.progress = t.progress ?? 0

  const play =
    rec.playFile != null
      ? (t.files.find((f) => f.path === rec.playFile!.path) ?? rec.playFile)
      : null
  if (play && play.length > 0) {
    const need = playbackReadyBytes(play)
    base.canPlay = Boolean(t.done || play.downloaded >= need)
    base.playFileLabel = play.name
  }

  if (t.done) {
    base.status = 'complete'
  } else if (t.paused) {
    base.status = 'paused'
  } else {
    base.status = 'downloading'
  }

  return base
}

function onTorrentReady(rec: DownloadRecord, torrent: WtTorrent): void {
  rec.wt = torrent
  let file: WtFile | null = null
  const pref = rec.resumedPlayFilePath
  if (pref) {
    file = torrent.files.find((f) => f.path === pref || f.name === pref) ?? null
  }
  if (!file) {
    file = pickPlayableFile(torrent)
  }
  if (!file) {
    rec.status = 'error'
    rec.errorMessage = 'No playable video file in this torrent.'
    rec.resumedPlayFilePath = undefined
    rec.resumedPaused = undefined
    void removeTorrentFromClient(torrent)
    schedulePersistMovieDownloads()
    return
  }
  rec.playFile = file
  rec.resumedPlayFilePath = undefined
  if (typeof file.select === 'function') {
    file.select(4)
  }
  const wantPause = Boolean(rec.resumedPaused)
  rec.resumedPaused = undefined
  if (torrent.done) {
    rec.status = 'complete'
    captureCompleteSnapshot(rec, torrent)
  } else if (wantPause) {
    torrent.pause?.()
    rec.status = 'paused'
  } else {
    rec.status = 'downloading'
  }
  torrent.once('done', () => {
    rec.status = 'complete'
    const tor = rec.wt
    if (tor && !tor.destroyed) {
      captureCompleteSnapshot(rec, tor)
    }
    schedulePersistMovieDownloads()
  })
  schedulePersistMovieDownloads()
}

async function attachTorrent(rec: DownloadRecord): Promise<void> {
  try {
    const c = await getReadyClient()
    const downloadPath = join(baseDownloadDir(), String(rec.movieId), rec.id)
    mkdirSync(downloadPath, { recursive: true })

    const t = c.add(
      rec.magnetUri.trim(),
      {
        path: downloadPath,
        destroyStoreOnDestroy: false,
        strategy: 'sequential'
      },
      (rtUnknown) => {
        onTorrentReady(rec, rtUnknown as WtTorrent)
      }
    ) as WtTorrent

    rec.wt = t

    t.once('error', (err) => {
      if (rec.status !== 'complete') {
        rec.status = 'error'
        rec.errorMessage = err?.message ?? 'Torrent error'
      }
      schedulePersistMovieDownloads()
    })

    t.once('close', () => {
      if (t.done) {
        rec.status = 'complete'
        schedulePersistMovieDownloads()
        return
      }
      if (rec.status !== 'complete' && rec.status !== 'error') {
        rec.status = 'error'
        rec.errorMessage = rec.errorMessage ?? 'Torrent closed.'
      }
      schedulePersistMovieDownloads()
    })
  } catch (e) {
    rec.status = 'error'
    rec.errorMessage = e instanceof Error ? e.message : String(e)
    schedulePersistMovieDownloads()
  }
}

export function addMovieDownload(payload: AddMovieTorrentPayload): AddMovieTorrentResponse {
  const magnet = payload.magnetUri.trim()
  if (!isValidMagnetUri(magnet)) {
    return { ok: false, error: 'Invalid magnet link.' }
  }

  const key = normalizeMagnet(magnet)
  for (const r of records.values()) {
    if (normalizeMagnet(r.magnetUri) === key) {
      if (r.movieId === payload.movieId) {
        return { ok: false, error: 'This torrent is already in the download list for this movie.' }
      }
      return { ok: false, error: 'This magnet is already queued for another movie.' }
    }
  }

  const id = randomUUID()
  const rec: DownloadRecord = {
    id,
    movieId: payload.movieId,
    magnetUri: magnet,
    displayTitle: payload.title.trim() || 'Torrent',
    indexerSeeders: Math.max(0, Math.floor(payload.indexerSeeders)),
    indexerLeechers: Math.max(0, Math.floor(payload.indexerLeechers)),
    createdAt: Date.now(),
    wt: null,
    playFile: null,
    status: 'pending_metadata'
  }
  records.set(id, rec)
  void attachTorrent(rec)
  schedulePersistMovieDownloads()
  return { ok: true, downloadId: id }
}

export function getMovieDownloads(movieId: number): MovieTorrentDownloadSnapshot[] {
  return [...records.values()]
    .filter((r) => r.movieId === movieId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(buildSnapshot)
}

export function getAllMovieDownloads(): MovieTorrentDownloadSnapshot[] {
  return [...records.values()].sort((a, b) => b.createdAt - a.createdAt).map(buildSnapshot)
}

export async function removeMovieDownload(
  movieId: number,
  downloadId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = records.get(downloadId)
  if (!rec || rec.movieId !== movieId) {
    return { ok: false, error: 'Download not found.' }
  }
  records.delete(downloadId)
  if (rec.wt && !rec.wt.destroyed) {
    const c = getClientIfExists()
    if (c) {
      await c.remove(rec.wt, { destroyStore: true }).catch(() => {})
    }
  }
  schedulePersistMovieDownloads()
  return { ok: true }
}

export async function setMovieDownloadPaused(
  movieId: number,
  downloadId: string,
  paused: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rec = records.get(downloadId)
  if (!rec || rec.movieId !== movieId) {
    return { ok: false, error: 'Download not found.' }
  }
  const torrent = rec.wt
  if (!torrent || torrent.destroyed) {
    return { ok: false, error: 'Torrent is not active yet.' }
  }
  if (torrent.done) {
    return { ok: false, error: 'Cannot pause a completed download.' }
  }
  if (paused) {
    torrent.pause?.()
  } else {
    torrent.resume?.()
  }
  schedulePersistMovieDownloads()
  return { ok: true }
}

export async function startMoviePlayback(
  movieId: number,
  downloadId: string
): Promise<TorrentStreamStartResponse> {
  const rec = records.get(downloadId)
  if (!rec || rec.movieId !== movieId) {
    return { ok: false, error: 'Download not found.' }
  }

  const torrent = rec.wt
  if (torrent && !torrent.destroyed && torrent.paused) {
    torrent.resume?.()
  }

  const snap = buildSnapshot(rec)
  if (snap.status === 'error') {
    return { ok: false, error: snap.errorMessage ?? 'Torrent is in an error state.' }
  }
  if (!snap.canPlay) {
    return { ok: false, error: 'Not enough data buffered to play yet.' }
  }

  const file = rec.playFile
  if (!torrent || torrent.destroyed || !torrent.ready || !file) {
    return { ok: false, error: 'Torrent is not ready for playback.' }
  }

  try {
    const c = await getReadyClient()
    const port = await ensureHttpServer(c)
    const live = torrent.files.find((f) => f.path === file.path) ?? file
    if (typeof live.select === 'function') {
      live.select(4)
    }

    const sidecars = listTorrentSidecarSubtitles(torrent, live.path)
    const subtitles: TorrentSubtitleTrack[] = sidecars.map((s) => {
      const wtFile = torrent.files.find((f) => f.path === s.path)
      if (wtFile && typeof wtFile.select === 'function') {
        wtFile.select(2)
      }
      return {
        src: buildStreamUrl(torrent.infoHash, s.path, port),
        label: subtitleTrackLabel(s.displayName),
        type: s.format,
        language: guessSubtitleLanguage(s.displayName)
      }
    })

    const streamUrl = buildStreamUrl(torrent.infoHash, live.path, port)

    if (needsExternalPlayer(live.name)) {
      // Chromium can't play MKV/AVI etc. Hand off to mpv, pointed at the
      // local WebTorrent HTTP URL so mpv's seeks translate into range
      // requests that WebTorrent prioritizes (seek-aware download).
      const res = await startExternalMpvSession({ url: streamUrl, title: live.name })
      if (!res.ok) return res
      return {
        ok: true,
        kind: 'external',
        player: 'mpv',
        fileLabel: live.name
      }
    }

    return { ok: true, kind: 'inline', streamUrl, fileLabel: live.name, subtitles }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'Could not start playback.' }
  }
}

export function shutdownMovieDownloads(): void {
  records.clear()
  shutdownCurrentMpvSession()
  shutdownWebTorrentCore()
}
