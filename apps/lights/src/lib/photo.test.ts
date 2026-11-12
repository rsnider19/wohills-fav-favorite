import { beforeEach, describe, expect, it, vi } from 'vitest'

const core = vi.hoisted(() => ({ prepareImageForUpload: vi.fn() }))
vi.mock('@wohills/core', () => core)

import { preparePhoto, stripJpegMetadata } from './photo'

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

const SOI = [0xff, 0xd8]
const APP0 = seg(0xe0, ascii('JFIF\0'))
const EXIF = seg(0xe1, ascii('Exif\0\0GPS 40.12314 -83.05157'))
const ICC = seg(0xe2, ascii('ICC_PROFILE'))
const IPTC = seg(0xed, ascii('Photoshop 3.0 Worthington'))
const COM = seg(0xfe, ascii('shot on my phone'))
const DQT = seg(0xdb, [0, 1, 2, 3])
const SCAN = [...seg(0xda, [1, 2, 3]), 0x12, 0x34, 0xff, 0x00, 0xff, 0xd9]

const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat())
const text = (b: Uint8Array) => String.fromCharCode(...b)

describe('stripJpegMetadata', () => {
  it('drops EXIF/XMP, IPTC and comments, keeps JFIF, the colour profile, tables and the scan', () => {
    const out = stripJpegMetadata(jpeg(SOI, APP0, EXIF, ICC, IPTC, COM, DQT, SCAN))
    expect([...out]).toEqual([...jpeg(SOI, APP0, ICC, DQT, SCAN)])
    expect(text(out)).not.toMatch(/Exif|GPS|Photoshop|phone/)
  })

  it('skips fill bytes between segments', () => {
    expect([...stripJpegMetadata(jpeg(SOI, [0xff], EXIF, DQT, SCAN))]).toEqual([...jpeg(SOI, DQT, SCAN)])
  })

  it('refuses what is not a well-formed JPEG header', () => {
    expect(() => stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow()
    expect(() => stripJpegMetadata(jpeg(SOI, [0xff, 0xe1, 0x40, 0x00, 1, 2]))).toThrow() // length past the end
    expect(() => stripJpegMetadata(jpeg(SOI, APP0))).toThrow() // no image data
  })
})

describe('preparePhoto', () => {
  beforeEach(() => core.prepareImageForUpload.mockReset())

  it('passes a re-encoded photo through untouched', async () => {
    const reencoded = { blob: new Blob(['x']), contentType: 'image/jpeg' }
    core.prepareImageForUpload.mockResolvedValue(reencoded)
    expect(await preparePhoto(new File([jpeg(SOI, EXIF, SCAN)], 'a.jpg'))).toBe(reencoded)
  })

  it("strips a JPEG that core handed back as is (the browser couldn't decode it)", async () => {
    const file = new File([jpeg(SOI, APP0, EXIF, SCAN)], 'a.jpg', { type: 'image/jpeg' })
    core.prepareImageForUpload.mockResolvedValue({ blob: file, contentType: 'image/jpeg' })
    const out = await preparePhoto(file)
    expect(out.contentType).toBe('image/jpeg')
    expect([...new Uint8Array(await out.blob.arrayBuffer())]).toEqual([...jpeg(SOI, APP0, SCAN)])
  })

  it('refuses any other original (its metadata would go up with it)', async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' })
    core.prepareImageForUpload.mockResolvedValue({ blob: file, contentType: 'image/png' })
    await expect(preparePhoto(file)).rejects.toThrow()
  })
})
