import type { AnySupabaseClient } from './context'

/** Decode a photo to something drawable, preferring createImageBitmap but
 *  falling back to an <img> element (more forgiving on mobile Safari). */
export async function decodeImage(file: Blob): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}> {
  try {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() }
  } catch {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.src = objectUrl
    await img.decode()
    if (!img.naturalWidth) {
      URL.revokeObjectURL(objectUrl)
      throw new Error('image decoded empty')
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  }
}

/** Identify the real format from magic bytes — file.type lies (iPhones have
 *  handed over HEIC labeled as image/png). */
export async function sniffType(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const ascii = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'image/png'
  if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image/webp'
  if (ascii.slice(4, 8) === 'ftyp') return 'image/heic'
  return file.type || 'unknown'
}

/** Downscale to maxDim and re-encode as JPEG so phone photos (often huge,
 *  sometimes HEIC) become small files every browser can display. Re-encoding
 *  through a canvas also drops EXIF, including GPS. */
export async function toJpeg(file: Blob, maxDim: number, quality = 0.85): Promise<Blob> {
  const { source, width, height, cleanup } = await decodeImage(file)
  try {
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not encode image'))), 'image/jpeg', quality),
    )
  } finally {
    cleanup()
  }
}

/** Resize to a JPEG when this browser can decode the photo. If it can't, fall
 *  back to the original, but only if its real bytes (not the self-reported
 *  type) are a format every browser can display. Throws with a user-facing message. */
export async function prepareImageForUpload(
  file: File,
  { maxDim = 1600, maxBytes = 9_000_000 }: { maxDim?: number; maxBytes?: number } = {},
): Promise<{ blob: Blob; contentType: string }> {
  try {
    return { blob: await toJpeg(file, maxDim), contentType: 'image/jpeg' }
  } catch {
    const realType = await sniffType(file)
    if (realType === 'image/heic')
      throw new Error("this is a HEIC photo, which browsers can't show — screenshot it and upload the screenshot")
    if (!/^image\/(jpeg|png|webp)$/.test(realType)) throw new Error('unsupported image format')
    if (file.size > maxBytes) throw new Error('photo too large')
    return { blob: file, contentType: realType }
  }
}

/** Uploads to a public bucket and returns the object's public URL. Use a
 *  unique path per upload so the CDN never serves a stale photo. */
export async function uploadPublicImage(
  client: AnySupabaseClient,
  { bucket, path, blob, contentType }: { bucket: string; path: string; blob: Blob; contentType: string },
): Promise<string> {
  const { error } = await client.storage.from(bucket).upload(path, blob, { contentType })
  if (error) throw error
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
