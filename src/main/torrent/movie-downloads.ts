import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  statSync
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { Preferences } from '@shared/preferences'
import { getPreferences, preferenceEvents } from '../preferences-store'
import { getAppSettings } from '../settings-store'
import { getMovieDetails, hasTmdbCredentials } from '../tmdb'
import { computeMovieHash, fetchSubtitle, subtitleCacheRoot } from '../subtitles/opensubtitles'
import { isValidMagnetUri } from '@shared/torrent'
import type {
  AddMovieTorrentPayload,
  AddMovieTorrentResponse,
  MovieTorrentDownloadSnapshot,
  MovieTorrentFileProgress,
  UntrackedDownload
} from '@shared/torrent-downloads'
import type { TorrentStreamStartResponse, TorrentSubtitleTrack } from '@shared/torrent-stream'
import {
  applyBandwidthLimits,
  baseDownloadDir,
  buildStreamUrl,
  defaultDownloadDir,
  ensureHttpServer,
  getClientIfExists,
  getReadyClient,
  listTorrentSidecarSubtitles,
  pickPlayableFile,
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
import {
  findMpvBinary,
  mpvEvents,
  shutdownCurrentMpvSession,
  startExternalMpvSession,
  type MpvPlaybackState
} from './mpv-controller'
import { getWatchProgress, recordWatchProgress } from '../watch-history'
import { resumePosition } from '@shared/watch-history'
import { localMediaUrl, setLocalMediaRoots } from '../local-media-protocol'
import { PUBLIC_TRACKERS } from './public-trackers'
import {
  MP4_HEAD_PROBE_BYTES,
  headBytesNeeded,
  isMp4Container,
  parseMp4Layout,
  type Mp4Layout
} from './playback-readiness'

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
  movieTitle: string | null
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
  /** Folder holding this download's files. */
  downloadDir: string
  /** Absolute path of the finished video on disk; set once the torrent leaves the swarm. */
  playFileAbsPath?: string | null
  /** Finished while being streamed; leave the swarm when that playback ends. */
  pendingDetach?: boolean
  /** Paths (within the torrent) of the only files we download: the video and its subtitles. */
  wantedPaths: string[]
  /** MP4 index location, once the head of the file is on disk. */
  mp4Layout?: Mp4Layout
}

/** True when every piece covering bytes [start, end) of `file` is downloaded and verified. */
function hasFileRange(t: WtTorrent, file: WtFile, start: number, end: number): boolean {
  if (end <= start) return true
  const pieceLength = t.pieceLength
  const bitfield = t.bitfield
  if (!pieceLength || !bitfield || file.offset == null) return false
  const first = Math.floor((file.offset + start) / pieceLength)
  const last = Math.floor((file.offset + end - 1) / pieceLength)
  for (let i = first; i <= last; i++) {
    if (!bitfield.get(i)) return false
  }
  return true
}

function readFileHead(absPath: string, bytes: number): Uint8Array | null {
  let fd: number | null = null
  try {
    fd = openSync(absPath, 'r')
    const buf = Buffer.alloc(bytes)
    const n = readSync(fd, buf, 0, bytes, 0)
    return new Uint8Array(buf.buffer, buf.byteOffset, n)
  } catch {
    return null
  } finally {
    if (fd != null) closeSync(fd)
  }
}

/**
 * Playback can start once the start of the file is on disk and, for MP4s whose index sits at the
 * end, that index too. The index range is fetched with top priority as soon as it is located.
 */
function isReadyToPlay(rec: DownloadRecord, t: WtTorrent, play: WtFile): boolean {
  if (!hasFileRange(t, play, 0, headBytesNeeded(play.length))) return false
  if (!isMp4Container(play.name)) return true
  if (rec.mp4Layout == null) {
    const head = readFileHead(
      join(rec.downloadDir, play.path),
      Math.min(play.length, MP4_HEAD_PROBE_BYTES)
    )
    if (!head) return false
    rec.mp4Layout = parseMp4Layout(head, play.length)
    if (rec.mp4Layout.kind === 'moov-at-end' && t.pieceLength && play.offset != null) {
      const first = Math.floor((play.offset + rec.mp4Layout.moovOffset) / t.pieceLength)
      const last = Math.floor((play.offset + play.length - 1) / t.pieceLength)
      t.select?.(first, last, 5)
    }
  }
  if (rec.mp4Layout.kind === 'moov-at-end') {
    return hasFileRange(t, play, rec.mp4Layout.moovOffset, play.length)
  }
  return true
}

function wantedFiles(rec: DownloadRecord, t: WtTorrent): WtFile[] {
  if (!t.files?.length) return []
  if (rec.wantedPaths.length === 0) return t.files
  return t.files.filter((f) => rec.wantedPaths.includes(f.path))
}

/**
 * WebTorrent's `file.downloaded` under-counts a file that ends exactly on a piece boundary, so
 * completeness comes from the verified-piece bitfield instead.
 */
function isFileComplete(t: WtTorrent, f: WtFile): boolean {
  return f.length === 0 || hasFileRange(t, f, 0, f.length)
}

function wantedTotals(rec: DownloadRecord, t: WtTorrent): { length: number; downloaded: number } {
  let length = 0
  let downloaded = 0
  for (const f of wantedFiles(rec, t)) {
    length += f.length
    downloaded += isFileComplete(t, f) ? f.length : Math.min(f.length, f.downloaded)
  }
  return { length, downloaded }
}

/** The download is finished when every wanted file is on disk; other files are never fetched. */
function isWantedDone(rec: DownloadRecord, t: WtTorrent): boolean {
  if (t.done) return true
  if (!t.ready) return false
  const files = wantedFiles(rec, t)
  return files.length > 0 && files.every((f) => isFileComplete(t, f))
}

const records = new Map<string, DownloadRecord>()

/** Download currently streamed through the WebTorrent HTTP server (inline player or mpv). */
let streamingDownloadId: string | null = null
let streamingVia: 'inline' | 'mpv' | null = null

let persistTimer: ReturnType<typeof setTimeout> | null = null

function recordDownloadDir(movieId: number, id: string): string {
  return join(baseDownloadDir(), String(movieId), id)
}

/**
 * Finished torrents leave the swarm so the app never uploads after a download completes.
 * Files stay on disk and are played locally from then on.
 */
function detachCompletedTorrent(rec: DownloadRecord): void {
  const t = rec.wt
  if (!t || t.destroyed) return
  if (streamingDownloadId === rec.id) {
    rec.pendingDetach = true
    return
  }
  rec.pendingDetach = false
  rec.status = 'complete'
  captureCompleteSnapshot(rec, t)
  if (rec.playFile) {
    rec.playFileAbsPath = join(rec.downloadDir, rec.playFile.path)
  }
  rec.wt = null
  const c = getClientIfExists()
  if (c) {
    void c.remove(t, { destroyStore: false }).catch(() => {})
  }
  schedulePersistMovieDownloads()
  startQueuedDownloads()
}

/** Called when a stream through the WebTorrent HTTP server stops (player closed or mpv exited). */
export function endStreamingPlayback(via?: 'inline' | 'mpv'): void {
  if (via && streamingVia !== via) return
  const id = streamingDownloadId
  streamingDownloadId = null
  streamingVia = null
  if (!id) return
  const rec = records.get(id)
  if (rec?.pendingDetach) {
    detachCompletedTorrent(rec)
  }
}

mpvEvents.on('end', () => endStreamingPlayback('mpv'))

function captureCompleteSnapshot(rec: DownloadRecord, torrent: WtTorrent): void {
  const totals = wantedTotals(rec, torrent)
  rec.completeSnapshot = {
    totalBytes: totals.length,
    downloaded: totals.downloaded,
    progress: 1,
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
  return {
    id: rec.id,
    movieId: rec.movieId,
    magnetUri: rec.magnetUri,
    displayTitle: rec.displayTitle,
    movieTitle: rec.movieTitle,
    indexerSeeders: rec.indexerSeeders,
    indexerLeechers: rec.indexerLeechers,
    createdAt: rec.createdAt,
    playFilePath: rec.playFile?.path ?? rec.resumedPlayFilePath ?? null,
    playFileAbsPath: rec.playFileAbsPath ?? null,
    downloadDir: rec.downloadDir,
    paused,
    completed: rec.status === 'complete',
    completeSummary
  }
}

/**
 * Set once shutdown begins. Tearing down the client fires torrent `close` events whose handlers
 * schedule saves; without this guard those saves would write the half-torn-down list to disk.
 */
let shuttingDown = false

function schedulePersistMovieDownloads(): void {
  if (shuttingDown) return
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
  if (shuttingDown) return
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
    const hasMagnet = isValidMagnetUri(row.magnetUri)
    if (!hasMagnet && !row.completed) continue
    const mKey = hasMagnet ? `${row.movieId}:${normalizeMagnet(row.magnetUri)}` : `id:${row.id}`
    if (seenMagnets.has(mKey)) continue
    seenMagnets.add(mKey)
    if (records.has(row.id)) continue
    const downloadDir = row.downloadDir ?? join(defaultDownloadDir(), String(row.movieId), row.id)
    const rec: DownloadRecord = {
      id: row.id,
      movieId: row.movieId,
      magnetUri: row.magnetUri.trim(),
      displayTitle: row.displayTitle.trim() || 'Torrent',
      movieTitle: row.movieTitle,
      indexerSeeders: row.indexerSeeders,
      indexerLeechers: row.indexerLeechers,
      createdAt: row.createdAt,
      wt: null,
      playFile: null,
      status: row.completed ? 'complete' : 'pending_metadata',
      completeSnapshot: row.completeSummary,
      resumedPlayFilePath: row.playFilePath ? row.playFilePath : undefined,
      resumedPaused: row.completed ? false : row.paused,
      downloadDir,
      wantedPaths: []
    }
    records.set(rec.id, rec)
    if (row.completed) {
      restoreCompletedFromDisk(rec, row.playFileAbsPath)
      continue
    }
    if (!row.paused) rec.status = 'queued'
    if (row.paused) void attachTorrent(rec)
  }
  startQueuedDownloads()
}

/** Downloads using a slot: attached to the swarm and not paused or finished. */
function activeDownloadCount(): number {
  let n = 0
  for (const r of records.values()) {
    if (r.status === 'pending_metadata' || r.status === 'downloading') n++
  }
  return n
}

/** Start queued downloads, oldest first, until the active-download cap is reached. */
function startQueuedDownloads(): void {
  const cap = getPreferences().maxActiveDownloads
  const queued = [...records.values()]
    .filter((r) => r.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const rec of queued) {
    if (activeDownloadCount() >= cap) break
    rec.status = 'pending_metadata'
    void attachTorrent(rec)
  }
}

preferenceEvents.on('change', (prefs: Preferences) => {
  applyBandwidthLimits(prefs)
  startQueuedDownloads()
})

/** Every folder that holds downloaded files, for the local media protocol. */
setLocalMediaRoots(() => [
  subtitleCacheRoot(),
  baseDownloadDir(),
  defaultDownloadDir(),
  ...[...records.values()].map((r) => r.downloadDir)
])

/** Completed downloads are never re-added to the swarm; only confirm the file is still there. */
function restoreCompletedFromDisk(rec: DownloadRecord, savedAbsPath: string | null): void {
  const legacyPath =
    rec.resumedPlayFilePath != null ? join(rec.downloadDir, rec.resumedPlayFilePath) : null
  const abs = savedAbsPath ?? legacyPath
  if (abs && existsSync(abs)) {
    rec.playFileAbsPath = abs
    return
  }
  rec.status = 'error'
  rec.errorMessage = 'File was moved or deleted.'
}

/** Same info-hash means the same torrent, whatever trackers or name the magnet carries. */
function normalizeMagnet(m: string): string {
  const lower = m.trim().toLowerCase()
  return /xt=urn:btih:([a-f0-9]{40})/.exec(lower)?.[1] ?? lower
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

function mapFileProgress(rec: DownloadRecord, t: WtTorrent): MovieTorrentFileProgress[] {
  return wantedFiles(rec, t).map((f) => ({
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
    movieTitle: rec.movieTitle,
    downloadDir: rec.downloadDir,
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
      base.files = mapFileProgress(rec, errT)
      base.torrentName = errT.name ?? null
    }
    return base
  }

  const t = rec.wt
  if (!t) {
    if (rec.status === 'queued') {
      return base
    }
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

  const done = isWantedDone(rec, t)
  const totals = wantedTotals(rec, t)
  base.files = mapFileProgress(rec, t)
  base.numPeers = t.numPeers ?? 0
  base.downloadSpeed = t.paused ? 0 : (t.downloadSpeed ?? 0)
  base.uploadSpeed = t.paused ? 0 : (t.uploadSpeed ?? 0)
  base.downloaded = totals.downloaded
  base.totalBytes = totals.length
  base.progress = totals.length > 0 ? totals.downloaded / totals.length : 0

  const play =
    rec.playFile != null
      ? (t.files.find((f) => f.path === rec.playFile!.path) ?? rec.playFile)
      : null
  if (play && play.length > 0) {
    base.canPlay = done || isReadyToPlay(rec, t, play)
    base.playFileLabel = play.name
  }

  if (done) {
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
  selectWantedFiles(rec, torrent, file)
  const wantPause = Boolean(rec.resumedPaused)
  rec.resumedPaused = undefined
  if (isWantedDone(rec, torrent)) {
    detachCompletedTorrent(rec)
    return
  }
  if (wantPause) {
    torrent.pause?.()
    rec.status = 'paused'
  } else {
    rec.status = 'downloading'
  }
  const checkDone = (): void => {
    if (rec.wt !== torrent) {
      torrent.removeListener?.('download', checkDone)
      return
    }
    if (isWantedDone(rec, torrent)) {
      torrent.removeListener?.('download', checkDone)
      detachCompletedTorrent(rec)
    }
  }
  torrent.on('download', checkDone)
  torrent.once('done', checkDone)
  schedulePersistMovieDownloads()
}

/**
 * Torrents start with nothing selected; fetch only the video and its sidecar subtitles.
 * Never `deselect()` the other files: WebTorrent removes whole piece ranges, so deselecting a
 * neighbour also drops the piece it shares with the video, and the download never finishes.
 */
function selectWantedFiles(rec: DownloadRecord, torrent: WtTorrent, video: WtFile): void {
  const subtitles = listTorrentSidecarSubtitles(torrent, video.path)
  rec.wantedPaths = [video.path, ...subtitles.map((s) => s.path)]
  for (const f of torrent.files) {
    if (f.path === video.path) f.select?.(4)
    else if (rec.wantedPaths.includes(f.path)) f.select?.(2)
  }
}

async function attachTorrent(rec: DownloadRecord): Promise<void> {
  try {
    const c = await getReadyClient()
    mkdirSync(rec.downloadDir, { recursive: true })

    const t = c.add(
      rec.magnetUri.trim(),
      {
        path: rec.downloadDir,
        destroyStoreOnDestroy: false,
        strategy: 'sequential',
        deselect: true,
        announce: [...PUBLIC_TRACKERS]
      },
      (rtUnknown) => {
        onTorrentReady(rec, rtUnknown as WtTorrent)
      }
    ) as WtTorrent

    if (rec.status !== 'complete') {
      rec.wt = t
    }

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
    if (r.magnetUri && normalizeMagnet(r.magnetUri) === key) {
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
    movieTitle: payload.movieTitle.trim() || null,
    indexerSeeders: Math.max(0, Math.floor(payload.indexerSeeders)),
    indexerLeechers: Math.max(0, Math.floor(payload.indexerLeechers)),
    createdAt: Date.now(),
    wt: null,
    playFile: null,
    status: 'queued',
    downloadDir: recordDownloadDir(payload.movieId, id),
    wantedPaths: []
  }
  records.set(id, rec)
  startQueuedDownloads()
  schedulePersistMovieDownloads()
  return { ok: true, downloadId: id }
}

export function getMovieDownloads(movieId: number): MovieTorrentDownloadSnapshot[] {
  return [...records.values()]
    .filter((r) => r.movieId === movieId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(buildSnapshot)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIDEO_FILE_RE = /\.(mp4|mkv|webm|m4v|mov|avi|ts|m2ts|mpg|mpeg|wmv)$/i

function largestVideoUnder(dir: string): { path: string; bytes: number } | null {
  let best: { path: string; bytes: number } | null = null
  let entries: string[]
  try {
    entries = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!VIDEO_FILE_RE.test(entry)) continue
    const abs = join(dir, entry)
    try {
      const size = statSync(abs).size
      if (!best || size > best.bytes) best = { path: abs, bytes: size }
    } catch {
      /* unreadable entry */
    }
  }
  return best
}

/**
 * Folders shaped `<root>/<movieId>/<downloadId>` that hold a video but are not in the list, e.g.
 * left behind when an older version lost the list on quit.
 */
export function scanUntrackedDownloads(): UntrackedDownload[] {
  const tracked = new Set([...records.values()].map((r) => resolve(r.downloadDir)))
  const out: UntrackedDownload[] = []
  for (const root of new Set([resolve(baseDownloadDir()), resolve(defaultDownloadDir())])) {
    let movieDirs: string[]
    try {
      movieDirs = readdirSync(root)
    } catch {
      continue
    }
    for (const movieDir of movieDirs) {
      if (!/^\d+$/.test(movieDir)) continue
      let ids: string[]
      try {
        ids = readdirSync(join(root, movieDir))
      } catch {
        continue
      }
      for (const id of ids) {
        const dir = join(root, movieDir, id)
        if (!UUID_RE.test(id) || tracked.has(dir) || records.has(id)) continue
        const video = largestVideoUnder(dir)
        if (!video) continue
        out.push({
          movieId: Number(movieDir),
          downloadId: id,
          dir,
          videoPath: video.path,
          bytes: video.bytes
        })
      }
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes)
}

function findUntracked(dir: string): UntrackedDownload | null {
  const target = resolve(dir)
  return scanUntrackedDownloads().find((u) => u.dir === target) ?? null
}

/** Adds an untracked folder back as a finished download that plays from disk. */
export function recoverUntrackedDownload(
  dir: string,
  movieTitle: string | null
): { ok: true } | { ok: false; error: string } {
  const u = findUntracked(dir)
  if (!u) return { ok: false, error: 'That folder is no longer available to recover.' }
  const label = basename(u.videoPath)
  records.set(u.downloadId, {
    id: u.downloadId,
    movieId: u.movieId,
    magnetUri: '',
    displayTitle: label,
    movieTitle,
    indexerSeeders: 0,
    indexerLeechers: 0,
    createdAt: Date.now(),
    wt: null,
    playFile: null,
    status: 'complete',
    completeSnapshot: {
      totalBytes: u.bytes,
      downloaded: u.bytes,
      progress: 1,
      torrentName: null,
      playFileLabel: label
    },
    downloadDir: u.dir,
    playFileAbsPath: u.videoPath,
    wantedPaths: []
  })
  schedulePersistMovieDownloads()
  return { ok: true }
}

export async function deleteUntrackedDownload(
  dir: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = findUntracked(dir)
  if (!u) return { ok: false, error: 'That folder is no longer available.' }
  await rm(u.dir, { recursive: true, force: true })
  return { ok: true }
}

/** The finished video if known, else the download's folder; null for unknown ids. */
export function getDownloadLocation(downloadId: string): string | null {
  const rec = records.get(downloadId)
  if (!rec) return null
  if (rec.playFileAbsPath && existsSync(rec.playFileAbsPath)) return rec.playFileAbsPath
  return existsSync(rec.downloadDir) ? rec.downloadDir : null
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
  if (streamingDownloadId === downloadId) {
    streamingDownloadId = null
    await shutdownCurrentMpvSession()
  }
  if (rec.wt && !rec.wt.destroyed) {
    const c = getClientIfExists()
    if (c) {
      await c.remove(rec.wt, { destroyStore: true }).catch(() => {})
    }
  }
  // Only ever delete the per-download folder `<root>/<movieId>/<downloadId>` this app created.
  const owned =
    basename(rec.downloadDir) === rec.id &&
    basename(dirname(rec.downloadDir)) === String(rec.movieId) &&
    isAbsolute(rec.downloadDir)
  if (owned) {
    await rm(rec.downloadDir, { recursive: true, force: true }).catch(() => {})
  }
  schedulePersistMovieDownloads()
  startQueuedDownloads()
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
  if (rec.status === 'complete' || torrent?.done) {
    return { ok: false, error: 'Cannot pause a completed download.' }
  }
  if (rec.status === 'queued') {
    return { ok: false, error: 'Queued downloads start on their own when a slot frees up.' }
  }
  if (!torrent || torrent.destroyed) {
    return { ok: false, error: 'Torrent is not active yet.' }
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

  endStreamingPlayback()

  if (rec.status === 'complete' && !rec.wt) {
    return startLocalPlayback(rec)
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

    // mpv reads the local WebTorrent HTTP URL, so its seeks become range requests that
    // WebTorrent prioritizes (seek-aware download).
    const streamUrl = buildStreamUrl(torrent.infoHash, live.path, port)
    const external = await externalSubtitlePaths(
      rec,
      sidecars.map((s) => s.displayName)
    )
    return await launchPlayback({
      rec,
      label: live.name,
      mpvUrl: streamUrl,
      mpvSubFiles: [...subtitles.map((s) => s.src), ...external],
      inlineUrl: streamUrl,
      inlineSubtitles: [...subtitles, ...inlineTracksForPaths(external)],
      streaming: true
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg || 'Could not start playback.' }
  }
}

type PlaybackTarget = {
  rec: DownloadRecord
  label: string
  /** Stream URL or absolute file path. */
  mpvUrl: string
  mpvSubFiles: string[]
  /** URL the in-app player can load; null when it cannot play this file. */
  inlineUrl: string | null
  inlineSubtitles: TorrentSubtitleTrack[]
  /** True when the file comes from the WebTorrent HTTP server rather than from disk. */
  streaming: boolean
}

/**
 * mpv plays every format and reports position, so it is the player whenever it is installed.
 * Without mpv, files Chromium can decode fall back to the in-app player.
 */
async function launchPlayback(t: PlaybackTarget): Promise<TorrentStreamStartResponse> {
  const startSeconds = resumePosition(getWatchProgress(t.rec.movieId))
  const inlineCapable = t.inlineUrl != null && !needsExternalPlayer(t.label)
  if (findMpvBinary() || !inlineCapable) {
    const res = await startExternalMpvSession({
      url: t.mpvUrl,
      title: t.label,
      subFiles: t.mpvSubFiles,
      startSeconds,
      tag: { movieId: t.rec.movieId, downloadId: t.rec.id }
    })
    if (!res.ok) return res
    if (t.streaming) {
      streamingDownloadId = t.rec.id
      streamingVia = 'mpv'
    }
    return { ok: true, kind: 'external', player: 'mpv', fileLabel: t.label }
  }
  if (t.streaming) {
    streamingDownloadId = t.rec.id
    streamingVia = 'inline'
  }
  return {
    ok: true,
    kind: 'inline',
    streamUrl: t.inlineUrl!,
    fileLabel: t.label,
    subtitles: t.inlineSubtitles,
    startSeconds
  }
}

function inlineTracksForPaths(paths: string[]): TorrentSubtitleTrack[] {
  const out: TorrentSubtitleTrack[] = []
  for (const p of paths) {
    const src = localMediaUrl(p)
    const m = /\.(srt|vtt|ssa|ass)$/i.exec(p)
    if (!src || !m) continue
    const name = basename(p)
    out.push({
      src,
      label: subtitleTrackLabel(name),
      type: m[1]!.toLowerCase() as TorrentSubtitleTrack['type'],
      language: guessSubtitleLanguage(name)
    })
  }
  return out
}

const imdbIdCache = new Map<number, string | null>()

async function imdbIdForMovie(movieId: number): Promise<string | null> {
  if (imdbIdCache.has(movieId)) return imdbIdCache.get(movieId) ?? null
  const settings = getAppSettings()
  if (!hasTmdbCredentials(settings)) return null
  try {
    const imdbId = (await getMovieDetails(settings, movieId)).imdbId
    imdbIdCache.set(movieId, imdbId)
    return imdbId
  } catch {
    return null
  }
}

/**
 * Downloads a subtitle in the preferred language from OpenSubtitles when the torrent has none
 * in that language. Finished files are matched by hash; partial ones by IMDb id only.
 */
async function externalSubtitlePaths(
  rec: DownloadRecord,
  existingSubtitleNames: string[]
): Promise<string[]> {
  const language = getPreferences().subtitleLanguage
  const apiKey = getAppSettings().openSubtitlesApiKey
  if (!language || !apiKey) return []
  if (existingSubtitleNames.some((n) => guessSubtitleLanguage(n) === language)) return []
  const imdbId = await imdbIdForMovie(rec.movieId)
  if (!imdbId) return []
  const finished = rec.status === 'complete' && rec.playFileAbsPath
  const path = await fetchSubtitle({
    apiKey,
    movieId: rec.movieId,
    imdbId,
    language,
    movieHash: finished ? computeMovieHash(rec.playFileAbsPath!) : null
  })
  return path ? [path] : []
}

mpvEvents.on('progress', (s: MpvPlaybackState) => {
  if (s.tag && s.position != null && s.duration != null) {
    recordWatchProgress(s.tag.movieId, s.position, s.duration)
  }
})

mpvEvents.on('end', (s: MpvPlaybackState) => {
  if (s.tag && s.position != null && s.duration != null) {
    recordWatchProgress(s.tag.movieId, s.position, s.duration)
  }
})

function listLocalSubtitleFiles(
  dir: string
): { absPath: string; name: string; format: TorrentSubtitleTrack['type'] }[] {
  let entries: string[]
  try {
    entries = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  } catch {
    return []
  }
  const out: { absPath: string; name: string; format: TorrentSubtitleTrack['type'] }[] = []
  for (const entry of entries) {
    const m = /\.(srt|vtt|ssa|ass)$/i.exec(entry)
    if (!m) continue
    out.push({
      absPath: join(dir, entry),
      name: basename(entry),
      format: m[1].toLowerCase() as TorrentSubtitleTrack['type']
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Plays a finished download straight from disk; the swarm is never involved. */
async function startLocalPlayback(rec: DownloadRecord): Promise<TorrentStreamStartResponse> {
  const abs = rec.playFileAbsPath
  if (!abs || !existsSync(abs)) {
    rec.status = 'error'
    rec.errorMessage = 'File was moved or deleted.'
    schedulePersistMovieDownloads()
    return { ok: false, error: rec.errorMessage }
  }
  const local = listLocalSubtitleFiles(rec.downloadDir)
  const subPaths = [
    ...local.map((s) => s.absPath),
    ...(await externalSubtitlePaths(
      rec,
      local.map((s) => s.name)
    ))
  ]
  return launchPlayback({
    rec,
    label: basename(abs),
    mpvUrl: abs,
    mpvSubFiles: subPaths,
    inlineUrl: localMediaUrl(abs),
    inlineSubtitles: inlineTracksForPaths(subPaths),
    streaming: false
  })
}

/** Saves the list, then tears down playback and the client. Nothing is written after this. */
export function shutdownMovieDownloads(): void {
  if (shuttingDown) return
  flushMovieDownloadsPersistence()
  shuttingDown = true
  void shutdownCurrentMpvSession()
  shutdownWebTorrentCore()
  records.clear()
}
