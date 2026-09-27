import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

const { movieHashFromChunks } = await import('./opensubtitles')

describe('movieHashFromChunks', () => {
  it('is the file size when both chunks are zero', () => {
    const zero = Buffer.alloc(64 * 1024)
    expect(movieHashFromChunks(0x1234, zero, zero)).toBe('0000000000001234')
  })

  it('sums little-endian 64-bit words with wrap-around', () => {
    const head = Buffer.alloc(64 * 1024)
    const tail = Buffer.alloc(64 * 1024)
    head.writeBigUInt64LE(0xffffffffffffffffn, 0)
    tail.writeBigUInt64LE(2n, 0)
    // size 0 + (2^64 - 1) + 2 wraps to 1
    expect(movieHashFromChunks(0, head, tail)).toBe('0000000000000001')
  })
})
