import { prepareImageForUpload } from '@wohills/core'
import type { PreparedPhoto } from './submit'

// Core's pipeline re-encodes every photo it can decode through a canvas, which drops EXIF
// (GPS, camera, time). When the browser can't decode it, core falls back to uploading the
// ORIGINAL bytes (jpeg/png/webp only), metadata and all. Entries are public, so the lights
// app never takes that fallback as is: a JPEG gets its metadata segments cut out here, and
// anything else is refused (a browser that can't decode it couldn't show it either).

/** JPEG markers kept before the image data: APP0 (JFIF), APP2 (ICC colour profile) and
 *  APP14 (Adobe colour transform). Every other APPn (APP1 = EXIF/XMP, APP13 = IPTC, …)
 *  and COM (comments) is dropped. */
const KEEP_APP = new Set([0xe0, 0xe2, 0xee])

/** Pure: the JPEG with its metadata segments removed. Throws on anything that isn't a
 *  well-formed JPEG header (the caller then refuses the photo). */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a jpeg')
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let i = 2
  for (;;) {
    if (i + 4 > bytes.length || bytes[i] !== 0xff) throw new Error('malformed jpeg')
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i++ // fill byte
      continue
    }
    if (marker === 0xda) {
      // Start of scan: the image data follows; metadata segments only come before it.
      parts.push(bytes.subarray(i))
      break
    }
    const end = i + 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
    if (end > bytes.length) throw new Error('malformed jpeg')
    const isApp = marker >= 0xe0 && marker <= 0xef
    if (!(isApp && !KEEP_APP.has(marker)) && marker !== 0xfe) parts.push(bytes.subarray(i, end))
    i = end
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** core's prepareImageForUpload, guaranteed metadata-free. Throws the same user-facing
 *  errors as core (PhotoStep maps them to copy). */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const prepared = await prepareImageForUpload(file)
  if (prepared.blob !== file) return prepared // re-encoded through a canvas: no EXIF left
  if (prepared.contentType !== 'image/jpeg') throw new Error('could not re-encode this photo')
  const clean = stripJpegMetadata(new Uint8Array(await file.arrayBuffer()))
  return { blob: new Blob([clean as BlobPart], { type: 'image/jpeg' }), contentType: 'image/jpeg' }
}

/** Which photo error copy fits a pipeline error (core's messages, or ours above). */
export function photoErrorKind(err: unknown): 'heic' | 'format' | 'size' | 'other' {
  const m = err instanceof Error ? err.message : ''
  if (/heic/i.test(m)) return 'heic'
  if (/unsupported/i.test(m)) return 'format'
  if (/too large/i.test(m)) return 'size'
  return 'other'
}
