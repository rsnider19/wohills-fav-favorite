import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Entry } from '../types'

/** Downscale to maxDim and re-encode as JPEG so phone photos (often huge,
 *  sometimes HEIC) become small files every browser can display. */
async function toJpeg(file: File, maxDim: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      0.85,
    ),
  )
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
      const jpeg = await toJpeg(file, 1600)
      // Unique name per upload so the CDN never serves a stale photo.
      const path = `entry-${entry.entry_number}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('floats')
        .upload(path, jpeg, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('floats').getPublicUrl(path)
      const { error: updateError } = await supabase
        .from('entries')
        .update({ image_url: data.publicUrl })
        .eq('id', entry.id)
      if (updateError) throw updateError
      onDone(`Photo updated for ${entry.theme} 📷`, true)
    } catch {
      onDone('Photo upload failed — try again.', false)
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
