import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('../preferences-store', () => ({ getPreferences: () => ({ downloadDir: '' }) }))

const { archiveVolumes, pickPlayableFile } = await import('./webtorrent-core')
type Torrent = Parameters<typeof pickPlayableFile>[0]

function torrent(files: [string, number][]): Torrent {
  return {
    files: files.map(([path, length]) => ({
      path,
      name: path.split('/').pop()!,
      length,
      downloaded: 0,
      progress: 0
    }))
  } as unknown as Torrent
}

describe('pickPlayableFile', () => {
  it('picks the largest video and ignores samples', () => {
    const t = torrent([
      ['Movie/Sample/movie-sample.mkv', 50_000_000],
      ['Movie/movie.mkv', 4_000_000_000],
      ['Movie/movie.nfo', 1_000]
    ])
    expect(pickPlayableFile(t)?.path).toBe('Movie/movie.mkv')
  })

  it('falls back to the first RAR volume when only a sample video exists', () => {
    const t = torrent([
      ['Movie/movie.r01', 50_000_000],
      ['Movie/movie.rar', 50_000_000],
      ['Movie/movie.r00', 50_000_000],
      ['Movie/Sample/movie.sample.mkv', 40_000_000]
    ])
    expect(pickPlayableFile(t)?.path).toBe('Movie/movie.rar')
    expect(archiveVolumes(t).map((f) => f.name)).toEqual(['movie.rar', 'movie.r00', 'movie.r01'])
  })

  it('orders .partNN.rar volumes numerically', () => {
    const t = torrent([
      ['m/m.part10.rar', 1],
      ['m/m.part2.rar', 1],
      ['m/m.part1.rar', 1]
    ])
    expect(archiveVolumes(t).map((f) => f.name)).toEqual([
      'm.part1.rar',
      'm.part2.rar',
      'm.part10.rar'
    ])
  })

  it('returns null when there is nothing playable', () => {
    expect(pickPlayableFile(torrent([['x/readme.txt', 10]]))).toBeNull()
  })
})
