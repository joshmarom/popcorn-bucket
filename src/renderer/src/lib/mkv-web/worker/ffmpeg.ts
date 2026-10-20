import FFMpegCore from './ffmpeg-core/ffmpeg-core.js?url'
import FFMpegWasm from './ffmpeg-core/ffmpeg-core.wasm?url'
import FFMpegWorker from './ffmpeg-core/ffmpeg-core.worker.js?url'
import { Observable, fromEventPattern, firstValueFrom } from 'rxjs'
import { takeWhile, toArray } from 'rxjs/operators'

declare class FileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer
}

enum FFmpegState {
  Uninitialized = 1,
  Initializing,
  Idle,
  Busy
}

export interface Stream {
  id: string
  lang?: string
  /** Long format description of a stream e.g. 'h264 (High 10), yuv420p10le(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 23.98 fps, 23.98 tbr, 1k tbn, 47.95 tbc (default)' **/
  formatDescription: string
}

export interface MediaMetadata {
  durationSeconds: number
  audioStreams: Stream[]
  videoStreams: Stream[]
}

interface ContainerType {
  /** FFMpeg format code of container as listed by 'ffmpeg -formats' **/
  ffmpegFormat: 'mp4' | 'webm'
  /** MIME type of container for SourceBuffer of a MediaSource **/
  mime: string
  /** Codec arguments (e.g. copy or transcode to browser-compatible AAC) **/
  codecArgs: string[]
}

export interface RemuxedChunkStream {
  data: Uint8Array
  mime: string
}

export interface RemuxedChunk {
  videoChunk: RemuxedChunkStream | null
  audioChunk: RemuxedChunkStream | null
}

type FFmpegFS = {
  mkdir: (path: string) => void
  rmdir: (path: string) => void
  readFile: (path: string) => Uint8Array
  unlink: (path: string) => void
  stat: (path: string) => { size: number }
}

type FFmpegCoreInstance = {
  FS: FFmpegFS
  FS_filesystems: {
    WORKERFS: {
      Gd: { readAsArrayBuffer: (slice: unknown) => ArrayBuffer } | null
    }
  }
  FS_mount: (fs: unknown, opts: { files: unknown[] }, mountpoint: string) => void
  FS_unmount: (mountpoint: string) => void
  cwrap: (
    name: string,
    returnType: string,
    argTypes: string[]
  ) => (argc: number, argv: number) => number
  _malloc: (size: number) => number
  _free: (ptr: number) => void
  lengthBytesUTF8: (str: string) => number
  stringToUTF8: (str: string, outPtr: number, maxBytesToWrite: number) => void
  setValue: (ptr: number, value: number, type: string) => void
}

const CHUNK_CACHE_BLOCK_BYTES = 1024 * 1024 // 1 MB blocks
const CHUNK_CACHE_MAX_BLOCKS = 32 // 32 MB LRU cache in worker

class RemoteRangeSlice {
  readonly size: number
  constructor(
    readonly file: RemoteRangeFile,
    readonly start: number,
    readonly end: number
  ) {
    this.size = Math.max(0, end - start)
  }
}

class RemoteRangeFile {
  readonly lastModifiedDate = new Date()
  private readonly cache = new Map<number, Uint8Array>()

  constructor(
    readonly url: string,
    readonly name: string,
    readonly size: number
  ) {}

  slice(start: number, end: number): RemoteRangeSlice {
    const s = Math.max(0, Math.min(start, this.size))
    const e = Math.max(s, Math.min(end, this.size))
    return new RemoteRangeSlice(this, s, e)
  }

  readRange(start: number, end: number): ArrayBuffer {
    const len = Math.max(0, end - start)
    if (len === 0) return new ArrayBuffer(0)

    const out = new Uint8Array(len)
    let written = 0
    while (written < len) {
      const pos = start + written
      const blockIdx = Math.floor(pos / CHUNK_CACHE_BLOCK_BYTES)
      const blockStart = blockIdx * CHUNK_CACHE_BLOCK_BYTES
      const block = this.getBlock(blockIdx, blockStart)
      const offsetInBlock = pos - blockStart
      const available = block.byteLength - offsetInBlock
      if (available <= 0) break
      const toCopy = Math.min(len - written, available)
      out.set(block.subarray(offsetInBlock, offsetInBlock + toCopy), written)
      written += toCopy
    }
    return out.buffer
  }

  private getBlock(blockIdx: number, blockStart: number): Uint8Array {
    const existing = this.cache.get(blockIdx)
    if (existing) {
      this.cache.delete(blockIdx)
      this.cache.set(blockIdx, existing)
      return existing
    }
    const blockEnd = Math.min(this.size, blockStart + CHUNK_CACHE_BLOCK_BYTES) - 1
    const xhr = new XMLHttpRequest()
    xhr.open('GET', this.url, false)
    xhr.responseType = 'arraybuffer'
    xhr.setRequestHeader('Range', `bytes=${blockStart}-${blockEnd}`)
    xhr.send(null)
    if (xhr.status !== 200 && xhr.status !== 206) {
      throw new Error(`Range request failed with status ${xhr.status} for ${this.url}`)
    }
    const buf = new Uint8Array(xhr.response as ArrayBuffer)
    const slice =
      xhr.status === 200 && buf.byteLength > blockEnd - blockStart + 1
        ? buf.slice(blockStart, blockEnd + 1)
        : buf
    if (this.cache.size >= CHUNK_CACHE_MAX_BLOCKS) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) this.cache.delete(oldestKey)
    }
    this.cache.set(blockIdx, slice)
    return slice
  }
}

function probeRemoteFileSize(url: string): number {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, false)
  xhr.responseType = 'arraybuffer'
  xhr.setRequestHeader('Range', 'bytes=0-0')
  xhr.send(null)
  if (xhr.status === 206) {
    const contentRange = xhr.getResponseHeader('Content-Range')
    const match = contentRange ? /\/(\d+)$/.exec(contentRange.trim()) : null
    if (match) return Number(match[1])
  }
  const contentLength = xhr.getResponseHeader('Content-Length')
  if (contentLength && Number(contentLength) > 0) {
    return Number(contentLength)
  }
  const buf = xhr.response as ArrayBuffer | null
  if (buf && buf.byteLength > 0) return buf.byteLength
  throw new Error(`Could not determine file size for ${url}`)
}

function extractAvcCodec(mp4: Uint8Array): string {
  for (let i = 0; i + 8 <= mp4.byteLength; i++) {
    if (
      mp4[i] === 0x61 && // 'a'
      mp4[i + 1] === 0x76 && // 'v'
      mp4[i + 2] === 0x63 && // 'c'
      mp4[i + 3] === 0x43 && // 'C'
      mp4[i + 4] === 1
    ) {
      const p = mp4[i + 5]!.toString(16).padStart(2, '0')
      const c = mp4[i + 6]!.toString(16).padStart(2, '0')
      const l = mp4[i + 7]!.toString(16).padStart(2, '0')
      return `avc1.${p}${c}${l}`
    }
  }
  return 'avc1.640033'
}

function extractHvcCodec(mp4: Uint8Array): string {
  for (let i = 0; i + 17 <= mp4.byteLength; i++) {
    if (
      mp4[i] === 0x68 && // 'h'
      mp4[i + 1] === 0x76 && // 'v'
      mp4[i + 2] === 0x63 && // 'c'
      mp4[i + 3] === 0x43 // 'C'
    ) {
      const b1 = mp4[i + 5]!
      const space = ['', 'A', 'B', 'C'][(b1 >> 6) & 3] ?? ''
      const tier = (b1 >> 5) & 1 ? 'H' : 'L'
      const profile = b1 & 0x1f
      const view = new DataView(mp4.buffer, mp4.byteOffset + i + 6, 4)
      const compat = view.getUint32(0)
      let rev = 0
      for (let bit = 0; bit < 32; bit++) {
        if ((compat >>> bit) & 1) rev = (rev | (1 << (31 - bit))) >>> 0
      }
      const level = mp4[i + 16]!
      const constraints = Array.from(mp4.subarray(i + 10, i + 16))
      while (constraints.length > 0 && constraints[constraints.length - 1] === 0) {
        constraints.pop()
      }
      const cStr = constraints.map((b) => b.toString(16).toUpperCase()).join('.')
      return `hvc1.${space}${profile}.${rev.toString(16).toUpperCase()}.${tier}${level}${cStr ? '.' + cStr : ''}`
    }
  }
  return 'hvc1.1.6.L93.B0'
}

function ffmpegVideoFormatToContainer(format: string): ContainerType {
  const lower = format.toLowerCase()
  if (lower.startsWith('h264')) {
    return {
      ffmpegFormat: 'mp4',
      mime: 'video/mp4; codecs="avc1.640033"',
      codecArgs: ['-vcodec', 'copy']
    }
  }
  if (lower.startsWith('hevc') || lower.startsWith('h265')) {
    return {
      ffmpegFormat: 'mp4',
      mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
      codecArgs: ['-vcodec', 'copy', '-tag:v', 'hvc1']
    }
  }
  if (lower.startsWith('vp9')) {
    return {
      ffmpegFormat: 'webm',
      mime: 'video/webm; codecs="vp9"',
      codecArgs: ['-vcodec', 'copy']
    }
  }
  if (lower.startsWith('vp8')) {
    return {
      ffmpegFormat: 'webm',
      mime: 'video/webm; codecs="vp8"',
      codecArgs: ['-vcodec', 'copy']
    }
  }
  if (lower.startsWith('av1')) {
    return {
      ffmpegFormat: 'mp4',
      mime: 'video/mp4; codecs="av01.0.08M.08"',
      codecArgs: ['-vcodec', 'copy']
    }
  }
  throw new Error('Unsupported video format description: ' + format)
}

function ffmpegAudioFormatToContainer(format: string): ContainerType {
  const lower = format.toLowerCase()
  if (lower.startsWith('aac')) {
    return {
      ffmpegFormat: 'mp4',
      mime: 'audio/mp4; codecs="mp4a.40.2"',
      codecArgs: ['-acodec', 'copy']
    }
  }
  if (lower.startsWith('mp3')) {
    return {
      ffmpegFormat: 'mp4',
      mime: 'audio/mp4; codecs="mp3"',
      codecArgs: ['-acodec', 'copy']
    }
  }
  if (lower.startsWith('flac')) {
    return {
      ffmpegFormat: 'mp4',
      mime: 'audio/mp4; codecs="flac"',
      codecArgs: ['-strict', '-2', '-acodec', 'copy']
    }
  }
  if (lower.startsWith('vorbis')) {
    return {
      ffmpegFormat: 'webm',
      mime: 'audio/webm; codecs="vorbis"',
      codecArgs: ['-acodec', 'copy']
    }
  }
  if (lower.startsWith('opus')) {
    return {
      ffmpegFormat: 'webm',
      mime: 'audio/webm; codecs="opus"',
      codecArgs: ['-acodec', 'copy']
    }
  }
  // Transcode AC-3 / E-AC-3 / DTS / PCM / TrueHD to stereo AAC-LC so browser MSE can decode it.
  return {
    ffmpegFormat: 'mp4',
    mime: 'audio/mp4; codecs="mp4a.40.2"',
    codecArgs: ['-c:a', 'aac', '-ac', '2', '-b:a', '192k']
  }
}

const MP4_MSE_MOVFLAGS =
  'frag_keyframe+empty_moov+default_base_moof+frag_discont+negative_cts_offsets'

export class FFmpeg {
  static defaultArgs = ['ffmpeg', '-hide_banner', '-nostdin', '-threads', '1']

  static streamRegex =
    /\s*Stream #(?<id>\d+:\d+)(?:\((?<lang>[^)]*)\))?(?:\[[^\]]*\])?: (?<type>\w+): (?<formatDescription>.*)/
  static durationRegex = /Duration: (\d+?):(\d{2}):(\d+(?:\.\d+)?),/

  private ffmpegCore!: FFmpegCoreInstance
  private ffmpegMain!: (argc: number, argv: number) => number
  private ffmpegLogObservable!: Observable<string>
  private inputPath?: string
  private inputMetadata!: MediaMetadata
  private outputDir = '/output'
  private inputDir = '/input'
  private mounted = false
  private dirsCreated = false
  private ffmpegState = FFmpegState.Uninitialized

  private assertState(expected: FFmpegState): void {
    if (this.ffmpegState !== expected) {
      throw new Error(`Expected state ${expected} but current state is ${this.ffmpegState}`)
    }
  }

  private assertInput(): void {
    if (typeof this.inputPath === 'undefined') {
      throw new Error('No file set as input with setInputFile')
    }
  }

  isLoaded(): boolean {
    return this.ffmpegState !== FFmpegState.Uninitialized
  }

  async load(): Promise<void> {
    this.assertState(FFmpegState.Uninitialized)
    this.ffmpegState = FFmpegState.Initializing

    type LogCallback = (line: string) => void
    const handlers: LogCallback[] = []

    const addLogHandler = (handler: LogCallback): void => {
      handlers.push(handler)
    }
    const removeLogHandler = (handler: LogCallback): void => {
      const idx = handlers.indexOf(handler)
      if (idx !== -1) handlers.splice(idx, 1)
    }
    this.ffmpegLogObservable = fromEventPattern<string>(addLogHandler, removeLogHandler)

    const logCallback = (line: string): void => {
      if (line === 'FFMPEG_END') {
        this.ffmpegState = FFmpegState.Idle
      }
      for (const handler of [...handlers]) {
        handler(line)
      }
    }

    const coreUrl = new URL(FFMpegCore, self.location.href).href
    const wasmUrl = new URL(FFMpegWasm, self.location.href).href
    const workerUrl = new URL(FFMpegWorker, self.location.href).href

    const g = self as unknown as {
      importScripts?: (...urls: string[]) => void
      createFFmpegCore?: (opts: Record<string, unknown>) => Promise<FFmpegCoreInstance>
    }
    if (typeof g.createFFmpegCore !== 'function') {
      try {
        g.importScripts?.(coreUrl)
      } catch {
        await import(/* @vite-ignore */ coreUrl)
      }
    }
    if (typeof g.createFFmpegCore !== 'function') {
      throw new Error('Failed to load createFFmpegCore in worker')
    }

    this.ffmpegCore = await g.createFFmpegCore({
      mainScriptUrlOrBlob: coreUrl,
      locateFile: (filePath: string, prefix: string) => {
        if (filePath.endsWith('ffmpeg-core.wasm')) {
          return wasmUrl
        }
        if (filePath.endsWith('ffmpeg-core.worker.js')) {
          return workerUrl
        }
        return prefix + filePath
      },
      printErr: logCallback,
      print: logCallback
    })

    const WORKERFS = this.ffmpegCore.FS_filesystems.WORKERFS
    let nativeReader: FileReaderSync | null = null
    WORKERFS.Gd = {
      readAsArrayBuffer: (slice: unknown): ArrayBuffer => {
        if (slice instanceof RemoteRangeSlice) {
          return slice.file.readRange(slice.start, slice.end)
        }
        if (!nativeReader) nativeReader = new FileReaderSync()
        return nativeReader.readAsArrayBuffer(slice as Blob)
      }
    }

    this.ffmpegMain = this.ffmpegCore.cwrap('main', 'number', ['number', 'number'])
    this.ffmpegState = FFmpegState.Idle
  }

  async setInputFile(input: File | string): Promise<void> {
    this.assertState(FFmpegState.Idle)
    const FS = this.ffmpegCore.FS
    const WORKERFS = this.ffmpegCore.FS_filesystems.WORKERFS

    if (!this.dirsCreated) {
      FS.mkdir(this.inputDir)
      FS.mkdir(this.outputDir)
      this.dirsCreated = true
    } else if (this.mounted) {
      try {
        this.ffmpegCore.FS_unmount(this.inputDir)
      } catch {
        /* ignore */
      }
      this.mounted = false
    }

    let mountEntry: File | RemoteRangeFile
    if (typeof input === 'string') {
      const size = probeRemoteFileSize(input)
      const fileName = 'input.mkv'
      mountEntry = new RemoteRangeFile(input, fileName, size)
      this.inputPath = `${this.inputDir}/${fileName}`
    } else {
      mountEntry = input
      this.inputPath = `${this.inputDir}/${input.name}`
    }

    this.ffmpegCore.FS_mount(WORKERFS, { files: [mountEntry] }, this.inputDir)
    this.mounted = true

    const logEntriesPromise: Promise<string[]> = firstValueFrom(
      this.ffmpegLogObservable.pipe(
        takeWhile((line) => line !== 'FFMPEG_END'),
        toArray()
      )
    )
    this.runFFmpeg('-i', this.inputPath)
    const logEntries = await logEntriesPromise

    this.inputMetadata = {
      durationSeconds: 0,
      audioStreams: [],
      videoStreams: []
    }
    for (const line of logEntries) {
      const durationMatch = line.match(FFmpeg.durationRegex)
      if (durationMatch) {
        this.inputMetadata.durationSeconds =
          parseFloat(durationMatch[3]!) +
          60 * parseInt(durationMatch[2]!, 10) +
          3600 * parseInt(durationMatch[1]!, 10)
      }

      const streamMatch = FFmpeg.streamRegex.exec(line)
      if (streamMatch?.groups) {
        const { id, lang, type, formatDescription } = streamMatch.groups
        if (!id || !type || !formatDescription) continue
        const stream: Stream = {
          id,
          lang,
          formatDescription
        }
        if (type === 'Audio') {
          this.inputMetadata.audioStreams.push(stream)
        } else if (
          type === 'Video' &&
          !formatDescription.includes('(attached pic)') &&
          !/^(mjpeg|png|bmp|gif|webp)\b/i.test(formatDescription)
        ) {
          this.inputMetadata.videoStreams.push(stream)
        }
      }
    }
  }

  async getMetadata(): Promise<MediaMetadata> {
    this.assertInput()
    return this.inputMetadata
  }

  async remuxChunk(
    seekOffsetSeconds = 0.0,
    durationSeconds?: number,
    videoStreamId?: string,
    audioStreamId?: string
  ): Promise<RemuxedChunk> {
    this.assertInput()

    let videoStream: Stream | undefined
    let videoContainer: ContainerType | undefined
    if (videoStreamId != null) {
      videoStream = this.inputMetadata.videoStreams.find((s) => s.id === videoStreamId)
      if (!videoStream) {
        throw new Error(`No video stream found with id ${videoStreamId}`)
      }
      videoContainer = ffmpegVideoFormatToContainer(videoStream.formatDescription)
    }

    let audioStream: Stream | undefined
    let audioContainer: ContainerType | undefined
    if (audioStreamId != null) {
      audioStream = this.inputMetadata.audioStreams.find((s) => s.id === audioStreamId)
      if (!audioStream) {
        throw new Error(`No audio stream found with id ${audioStreamId}`)
      }
      audioContainer = ffmpegAudioFormatToContainer(audioStream.formatDescription)
    }

    let args: string[] = [
      ...(seekOffsetSeconds > 0 ? ['-noaccurate_seek', '-ss', seekOffsetSeconds.toString()] : []),
      ...(typeof durationSeconds === 'undefined' ? [] : ['-t', durationSeconds.toString()]),
      '-copyts',
      '-i',
      this.inputPath!
    ]

    const videoOutPath = `${this.outputDir}/video`
    const audioOutPath = `${this.outputDir}/audio`

    if (videoStream && videoContainer) {
      args = args.concat([
        '-threads',
        '1',
        '-map_chapters',
        '-1',
        '-avoid_negative_ts',
        'disabled',
        '-map',
        videoStream.id,
        '-f',
        videoContainer.ffmpegFormat,
        ...videoContainer.codecArgs,
        ...(videoContainer.ffmpegFormat === 'mp4'
          ? ['-use_editlist', '0', '-movflags', MP4_MSE_MOVFLAGS]
          : []),
        videoOutPath
      ])
    }

    if (audioStream && audioContainer) {
      args = args.concat([
        '-threads',
        '1',
        '-map_chapters',
        '-1',
        '-avoid_negative_ts',
        'disabled',
        '-map',
        audioStream.id,
        '-f',
        audioContainer.ffmpegFormat,
        ...audioContainer.codecArgs,
        ...(audioContainer.ffmpegFormat === 'mp4'
          ? ['-use_editlist', '0', '-movflags', MP4_MSE_MOVFLAGS]
          : []),
        audioOutPath
      ])
    }

    this.runFFmpeg(...args)
    const FS = this.ffmpegCore.FS

    let videoChunk: RemuxedChunkStream | null = null
    let audioChunk: RemuxedChunkStream | null = null

    if (videoContainer) {
      try {
        const data = FS.readFile(videoOutPath)
        FS.unlink(videoOutPath)
        if (data.byteLength > 0) {
          let mime = videoContainer.mime
          if (videoStream && /^h264/i.test(videoStream.formatDescription)) {
            mime = `video/mp4; codecs="${extractAvcCodec(data)}"`
          } else if (videoStream && /^(hevc|h265)/i.test(videoStream.formatDescription)) {
            mime = `video/mp4; codecs="${extractHvcCodec(data)}"`
          }
          videoChunk = { data, mime }
        }
      } catch {
        /* empty output at EOF */
      }
    }

    if (audioContainer) {
      try {
        const data = FS.readFile(audioOutPath)
        FS.unlink(audioOutPath)
        if (data.byteLength > 0) {
          audioChunk = { data, mime: audioContainer.mime }
        }
      } catch {
        /* empty output at EOF */
      }
    }

    return {
      audioChunk,
      videoChunk
    }
  }

  private runFFmpeg(...args: string[]): void {
    this.assertState(FFmpegState.Idle)

    const fullArgs = FFmpeg.defaultArgs.concat(args)
    const ptrs: number[] = []
    const argsPtr = this.ffmpegCore._malloc(fullArgs.length * Uint32Array.BYTES_PER_ELEMENT)
    fullArgs.forEach((s, idx) => {
      const bufSize = this.ffmpegCore.lengthBytesUTF8(s) + 1
      const buf = this.ffmpegCore._malloc(bufSize)
      ptrs.push(buf)
      this.ffmpegCore.stringToUTF8(s, buf, bufSize)
      this.ffmpegCore.setValue(argsPtr + Uint32Array.BYTES_PER_ELEMENT * idx, buf, 'i32')
    })

    this.ffmpegState = FFmpegState.Busy
    try {
      this.ffmpegMain(fullArgs.length, argsPtr)
    } catch {
      /* ffmpeg exit throws ExitStatus when non-zero (e.g. -i probe) */
    } finally {
      for (const p of ptrs) this.ffmpegCore._free(p)
      this.ffmpegCore._free(argsPtr)
      this.ffmpegState = FFmpegState.Idle
    }
  }
}

export default FFmpeg
