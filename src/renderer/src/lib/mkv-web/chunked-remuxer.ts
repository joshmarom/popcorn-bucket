import * as Comlink from 'comlink'
import type FFmpeg from './worker/ffmpeg'

export type SpawnedFFmpegWorker = {
  proxy: Comlink.Remote<FFmpeg>
  terminate: () => void
}

export default function spawnFFmpegWorker(): SpawnedFFmpegWorker {
  const worker = new Worker(new URL('./worker/chunked-remuxer-worker.ts', import.meta.url), {
    type: 'module'
  })
  const proxy = Comlink.wrap<FFmpeg>(worker)
  return {
    proxy,
    terminate: () => {
      proxy[Comlink.releaseProxy]()
      worker.terminate()
    }
  }
}
