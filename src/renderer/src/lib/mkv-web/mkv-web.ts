import spawnFFmpegWorker, { type SpawnedFFmpegWorker } from './chunked-remuxer'
import type { Remote } from 'comlink'
import type { FFmpeg, MediaMetadata, RemuxedChunkStream } from './worker/ffmpeg'

type LogCallback = (logEntry: string) => void
type ErrorCallback = (error: Error) => void

const CHUNK_DURATION_SECONDS = 10.0
const BUFFER_AHEAD_THRESHOLD_SECONDS = 12.0

const MKV_RE = /\.(mkv|matroska)(?:$|[?#])/i

export function isMkvSource(url: string | null | undefined, label?: string | null): boolean {
  if (url && MKV_RE.test(url)) return true
  if (label && MKV_RE.test(label)) return true
  return false
}

export default class MKVWeb {
  videoElement: HTMLVideoElement | null = null
  mediaSource: MediaSource
  ffmpegWorker: Remote<FFmpeg> | null = null
  loadedMediaMetadata?: MediaMetadata

  audioSourceBuffer?: SourceBuffer
  videoSourceBuffer?: SourceBuffer

  private workerHandle: SpawnedFFmpegWorker | null = null
  private updating = false
  private pendingCheck = false
  private loadingStarted = false
  private destroyed = false
  private destroyTimer: ReturnType<typeof setTimeout> | null = null
  private lastRequestedStart = -1
  private boundOnTimeUpdate: () => void

  logCallbacks: LogCallback[] = []
  errorCallbacks: ErrorCallback[] = []

  constructor(video?: HTMLVideoElement) {
    if (typeof window === 'undefined' || !window.MediaSource) {
      throw new Error('Media Source Extensions are not supported by this browser.')
    }

    this.mediaSource = new MediaSource()
    this.boundOnTimeUpdate = () => {
      void this.onTimeUpdate()
    }

    if (video) {
      this.attachVideo(video, true)
    }
  }

  private ensureWorker(): Remote<FFmpeg> {
    if (!this.workerHandle) {
      this.workerHandle = spawnFFmpegWorker()
      this.ffmpegWorker = this.workerHandle.proxy
    }
    return this.ffmpegWorker!
  }

  attachVideo(video: HTMLVideoElement, assignObjectUrl = false): void {
    if (this.videoElement === video) return
    this.detachVideoListeners()
    this.videoElement = video
    if (assignObjectUrl) {
      const objectUrl = URL.createObjectURL(this.mediaSource)
      video.src = objectUrl
      this.mediaSource.addEventListener(
        'sourceopen',
        () => {
          URL.revokeObjectURL(objectUrl)
        },
        { once: true }
      )
    }
    if (this.loadedMediaMetadata) {
      this.attachVideoListeners()
      void this.onTimeUpdate()
    }
  }

  addLogCallback(cb: LogCallback): void {
    this.logCallbacks.push(cb)
  }

  addErrorCallback(cb: ErrorCallback): void {
    this.errorCallbacks.push(cb)
  }

  private log(logEntry: string): void {
    for (const cb of this.logCallbacks) {
      cb(logEntry)
    }
  }

  private reportError(err: unknown): void {
    if (this.destroyed) return
    const error = err instanceof Error ? err : new Error(String(err))
    for (const cb of this.errorCallbacks) {
      cb(error)
    }
  }

  async loadMedia(fileOrUrl: File | string): Promise<void> {
    if (this.loadingStarted || this.destroyed) return
    this.loadingStarted = true
    try {
      await this.waitOpenState()
      if (this.destroyed) return

      const worker = this.ensureWorker()
      if (!(await worker.isLoaded())) {
        this.log('Starting ffmpeg worker')
        await worker.load()
        this.log('Loaded ffmpeg worker')
      }
      if (this.destroyed) return

      await worker.setInputFile(fileOrUrl)
      if (this.destroyed) return

      this.loadedMediaMetadata = await worker.getMetadata()
      this.logMetadata()

      if (
        this.mediaSource.readyState === 'open' &&
        Number.isFinite(this.loadedMediaMetadata.durationSeconds) &&
        this.loadedMediaMetadata.durationSeconds > 0
      ) {
        this.mediaSource.duration = this.loadedMediaMetadata.durationSeconds
      }

      this.attachVideoListeners()
      await this.onTimeUpdate()
    } catch (err) {
      this.reportError(err)
    }
  }

  private attachVideoListeners(): void {
    if (!this.videoElement) return
    this.videoElement.addEventListener('timeupdate', this.boundOnTimeUpdate)
    this.videoElement.addEventListener('seeking', this.boundOnTimeUpdate)
    this.videoElement.addEventListener('waiting', this.boundOnTimeUpdate)
  }

  private detachVideoListeners(): void {
    if (!this.videoElement) return
    this.videoElement.removeEventListener('timeupdate', this.boundOnTimeUpdate)
    this.videoElement.removeEventListener('seeking', this.boundOnTimeUpdate)
    this.videoElement.removeEventListener('waiting', this.boundOnTimeUpdate)
  }

  private logMetadata(): void {
    if (!this.loadedMediaMetadata) return
    this.log('Parsed metadata:')
    this.log(`  Duration: ${this.loadedMediaMetadata.durationSeconds}s`)
    for (const s of this.loadedMediaMetadata.audioStreams) {
      this.log(`  Audio stream ${s.id}(${s.lang || 'n/a'}): ${s.formatDescription}`)
    }
    for (const s of this.loadedMediaMetadata.videoStreams) {
      this.log(`  Video stream ${s.id}(${s.lang || 'n/a'}): ${s.formatDescription}`)
    }
  }

  private getBufferedEndAt(time: number): { buffered: boolean; end: number } {
    const buffers = this.mediaSource.sourceBuffers
    if (buffers.length === 0) {
      return { buffered: false, end: time }
    }

    let minEnd: number | undefined
    for (let i = 0; i < buffers.length; i++) {
      const sb = buffers[i]!
      const ranges = sb.buffered
      let matchedEnd: number | undefined

      for (let j = 0; j < ranges.length; j++) {
        const start = ranges.start(j)
        let end = ranges.end(j)
        // Merge consecutive ranges separated by tiny micro-gaps (< 0.5s)
        while (j + 1 < ranges.length && ranges.start(j + 1) - end < 0.5) {
          j++
          end = ranges.end(j)
        }
        // At the very beginning of playback (time < 1.5s), some MKV audio tracks start up to ~1s in.
        const startTolerance = time < 1.5 ? 1.5 : 0.5
        if (start - startTolerance <= time && time <= end + 0.05) {
          matchedEnd = end
          break
        }
      }

      if (matchedEnd === undefined) {
        return { buffered: false, end: time }
      }
      minEnd = minEnd === undefined ? matchedEnd : Math.min(minEnd, matchedEnd)
    }

    return { buffered: true, end: minEnd ?? time }
  }

  private async onTimeUpdate(): Promise<void> {
    if (this.destroyed || !this.videoElement || !this.loadedMediaMetadata) return
    if (this.mediaSource.readyState !== 'open') return

    if (this.updating) {
      this.pendingCheck = true
      return
    }

    const time = this.videoElement.currentTime
    const duration = this.loadedMediaMetadata.durationSeconds
    const { buffered, end: nextChunkTime } = this.getBufferedEndAt(time)

    if (duration > 0 && nextChunkTime >= duration - 0.5) {
      return
    }

    if (nextChunkTime - time < BUFFER_AHEAD_THRESHOLD_SECONDS) {
      // Back up slightly when seeking or continuing so audio and video keyframes overlap seamlessly.
      const seekStart = buffered
        ? Math.max(0, nextChunkTime - 0.5)
        : time > 1.0
          ? Math.max(0, time - 1.0)
          : 0
      const chunkLen = CHUNK_DURATION_SECONDS + (buffered ? 0.5 : time > 1.0 ? 1.0 : 0)
      await this.loadChunk(seekStart, chunkLen)
    }
  }

  private async loadChunk(start: number, len: number): Promise<void> {
    if (this.updating || this.destroyed || !this.loadedMediaMetadata) return
    if (Math.abs(this.lastRequestedStart - start) < 0.25) {
      return
    }

    this.updating = true
    this.lastRequestedStart = start
    let gotData = false

    try {
      const worker = this.ensureWorker()
      const audioStream =
        this.loadedMediaMetadata.audioStreams.find((s) => s.lang === 'eng' || s.lang === 'en') ??
        this.loadedMediaMetadata.audioStreams[0]

      this.log(`Remuxing media segment with time range [${start} - ${start + len}]`)
      const remuxedChunk = await worker.remuxChunk(
        start,
        len,
        this.loadedMediaMetadata.videoStreams[0]?.id,
        audioStream?.id
      )
      if (this.destroyed || this.mediaSource.readyState !== 'open') return

      if (this.audioSourceBuffer === undefined && remuxedChunk.audioChunk != null) {
        this.audioSourceBuffer = this.mediaSource.addSourceBuffer(remuxedChunk.audioChunk.mime)
      }
      if (this.videoSourceBuffer === undefined && remuxedChunk.videoChunk != null) {
        this.videoSourceBuffer = this.mediaSource.addSourceBuffer(remuxedChunk.videoChunk.mime)
      }

      const appends: Promise<void>[] = []
      if (remuxedChunk.audioChunk && this.audioSourceBuffer) {
        gotData = true
        appends.push(this.appendStreamChunk(this.audioSourceBuffer, remuxedChunk.audioChunk))
      }
      if (remuxedChunk.videoChunk && this.videoSourceBuffer) {
        gotData = true
        appends.push(this.appendStreamChunk(this.videoSourceBuffer, remuxedChunk.videoChunk))
      }
      await Promise.all(appends)

      // If the initial audio or video track starts slightly after 0s (e.g. 0.08s or 1.0s),
      // nudge currentTime into the buffered intersection so HTMLVideoElement transitions to HAVE_FUTURE_DATA.
      const v = this.videoElement
      if (v && v.readyState < 3 && v.buffered.length > 0) {
        const bufStart = v.buffered.start(0)
        if (bufStart > v.currentTime && bufStart - v.currentTime <= 2.0) {
          v.currentTime = bufStart + 0.01
        }
      }
    } catch (err) {
      this.reportError(err)
    } finally {
      this.updating = false
      if (!this.destroyed && (this.pendingCheck || gotData)) {
        this.pendingCheck = false
        void this.onTimeUpdate()
      }
    }
  }

  private async appendStreamChunk(
    sourceBuffer: SourceBuffer,
    chunk: RemuxedChunkStream
  ): Promise<void> {
    if (sourceBuffer.updating) {
      await new Promise<void>((resolve) => {
        sourceBuffer.addEventListener('updateend', () => resolve(), { once: true })
      })
    }
    if (this.destroyed || this.mediaSource.readyState !== 'open') return

    await new Promise<void>((resolve, reject) => {
      const onEnd = (): void => {
        sourceBuffer.removeEventListener('error', onError)
        const sizeMB = (chunk.data.byteLength / (1 << 20)).toFixed(3)
        this.log(
          `Added remuxed segment of type ${chunk.mime} with size ${sizeMB} MB to SourceBuffer`
        )
        resolve()
      }
      const onError = (): void => {
        sourceBuffer.removeEventListener('updateend', onEnd)
        reject(new Error(`SourceBuffer error while appending ${chunk.mime}`))
      }
      sourceBuffer.addEventListener('updateend', onEnd, { once: true })
      sourceBuffer.addEventListener('error', onError, { once: true })
      try {
        sourceBuffer.appendBuffer(chunk.data as BufferSource)
      } catch (err) {
        sourceBuffer.removeEventListener('updateend', onEnd)
        sourceBuffer.removeEventListener('error', onError)
        reject(err)
      }
    })
  }

  private waitOpenState(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.mediaSource.readyState === 'open') {
        resolve()
      } else if (this.mediaSource.readyState === 'closed') {
        this.mediaSource.addEventListener(
          'sourceopen',
          () => {
            resolve()
          },
          { once: true }
        )
      } else {
        reject(
          new Error(
            `Unexpected MediaSource readyState when asked to wait for open state: ${this.mediaSource.readyState}`
          )
        )
      }
    })
  }

  retain(): void {
    if (this.destroyTimer != null) {
      clearTimeout(this.destroyTimer)
      this.destroyTimer = null
    }
    this.destroyed = false
  }

  release(): void {
    if (this.destroyTimer != null) return
    this.destroyTimer = setTimeout(() => {
      this.destroyTimer = null
      this.destroy()
    }, 50)
  }

  destroy(): void {
    if (this.destroyTimer != null) {
      clearTimeout(this.destroyTimer)
      this.destroyTimer = null
    }
    if (this.destroyed) return
    this.destroyed = true
    this.detachVideoListeners()
    this.videoElement = null
    this.workerHandle?.terminate()
    this.workerHandle = null
    this.ffmpegWorker = null
  }
}
