import { describe, expect, it } from 'vitest'
import { sniffType } from './image'

const blob = (bytes: number[] | string, type = '') =>
  new Blob([typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)], { type })

describe('sniffType', () => {
  it('JPEG', async () => expect(await sniffType(blob([0xff, 0xd8, 0xff, 0xe0], 'image/png'))).toBe('image/jpeg'))
  it('PNG', async () => expect(await sniffType(blob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png'))
  it('WebP', async () => expect(await sniffType(blob('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp'))
  it('HEIC labelled as PNG (the iPhone case)', async () =>
    expect(await sniffType(blob('\0\0\0\x18ftypheic', 'image/png'))).toBe('image/heic'))
  it('falls back to the reported type, then "unknown"', async () => {
    expect(await sniffType(blob('GIF89a', 'image/gif'))).toBe('image/gif')
    expect(await sniffType(blob('hello'))).toBe('unknown')
  })
})
