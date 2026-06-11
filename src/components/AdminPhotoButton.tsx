import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Entry } from '../types'

/** Decode a photo to something drawable, preferring createImageBitmap but
 *  falling back to an <img> element (more forgiving on mobile Safari). */
async function decodeImage(file: File): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}> {
  try {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
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
async function sniffType(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const ascii = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'image/png'
  if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image/webp'
  if (ascii.slice(4, 8) === 'ftyp') return 'image/heic'
  return file.type || 'unknown'
}

/** Downscale to maxDim and re-encode as JPEG so phone photos (often huge,
 *  sometimes HEIC) become small files every browser can display. */
async function toJpeg(file: File, maxDim: number): Promise<Blob> {
  const { source, width, height, cleanup } = await decodeImage(file)
  try {
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('could not encode image'))),
        'image/jpeg',
        0.85,
      ),
    )
  } finally {
    cleanup()
  }
}

interface Props {
  entry: Entry
  /** Called with a toast message after the photo is saved (or fails). */
  onDone: (message: string, ok: boolean) => void
}

export default function AdminPhotoButton({ entry, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      // Resize when we can; if decoding fails on this browser, fall back to
      // uploading the original — but only if its actual bytes (not the
      // self-reported type) are a format every browser can display.
      let blob: Blob = file
      let contentType = file.type
      try {
        blob = await toJpeg(file, 1600)
        contentType = 'image/jpeg'
      } catch {
        const realType = await sniffType(file)
        if (realType === 'image/heic')
          throw new Error(
            "this is a HEIC photo, which browsers can't show — screenshot it and upload the screenshot",
          )
        if (!/^image\/(jpeg|png|webp)$/.test(realType))
          throw new Error('unsupported image format')
        contentType = realType
        if (file.size > 9_000_000) throw new Error('photo too large')
      }
      // Unique name per upload so the CDN never serves a stale photo.
      const path = `entry-${entry.entry_number}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('floats')
        .upload(path, blob, { contentType })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('floats').getPublicUrl(path)
      const { error: updateError } = await supabase
        .from('entries')
        .update({ image_url: data.publicUrl })
        .eq('id', entry.id)
      if (updateError) throw updateError
      onDone(`Photo updated for ${entry.theme || entry.street} 📷`, true)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      onDone(`Photo upload failed: ${detail}`, false)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        // No HEIC here: iOS converts to JPEG when HEIC isn't accepted.
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-full bg-ink/80 px-3 py-1.5 text-[11px] font-bold tracking-wider text-paper uppercase ring-1 ring-paper/25 backdrop-blur transition hover:bg-ink disabled:opacity-60"
      >
        {busy ? 'Uploading…' : '📷 Photo'}
      </button>
    </>
  )
}
