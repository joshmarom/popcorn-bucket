import { describe, expect, it } from 'vitest'
import { headBytesNeeded, parseMp4Layout } from './playback-readiness'

function box(type: string, size: number): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setUint32(0, size)
  b.set(
    [...type].map((c) => c.charCodeAt(0)),
    4
  )
  return b
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

describe('parseMp4Layout', () => {
  it('detects faststart files (moov before mdat)', () => {
    const head = concat(box('ftyp', 8), box('moov', 5000))
    expect(parseMp4Layout(head, 1_000_000)).toEqual({ kind: 'faststart' })
  })

  it('locates the index after mdat', () => {
    const head = concat(box('ftyp', 8), box('free', 8), box('mdat', 900_000))
    expect(parseMp4Layout(head, 1_000_000)).toEqual({ kind: 'moov-at-end', moovOffset: 900_016 })
  })

  it('reads 64-bit mdat sizes', () => {
    const large = new Uint8Array(16)
    const v = new DataView(large.buffer)
    v.setUint32(0, 1)
    large.set(
      [...'mdat'].map((c) => c.charCodeAt(0)),
      4
    )
    v.setBigUint64(8, 5_000_000_000n)
    const head = concat(box('ftyp', 8), large)
    expect(parseMp4Layout(head, 6_000_000_000)).toEqual({
      kind: 'moov-at-end',
      moovOffset: 5_000_000_008
    })
  })

  it('gives up on garbage', () => {
    expect(parseMp4Layout(new Uint8Array([0, 0, 0, 2, 1, 2, 3, 4]), 100)).toEqual({
      kind: 'unknown'
    })
  })
})

describe('headBytesNeeded', () => {
  it('asks for at least 4 MB or 1% of the file', () => {
    expect(headBytesNeeded(100 * 1024 * 1024)).toBe(4 * 1024 * 1024)
    expect(headBytesNeeded(2 * 1024 ** 3)).toBeCloseTo(0.01 * 2 * 1024 ** 3)
    expect(headBytesNeeded(1000)).toBe(1000)
  })
})
