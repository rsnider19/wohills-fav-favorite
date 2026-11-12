import { useState } from 'react'
import { prepareImageForUpload, uploadPublicImage, useSupabase } from '@wohills/core'
import { PhotoPicker } from '@wohills/ui'
import type { Entry } from '../types'

interface Props {
  entry: Entry
  /** Called with a toast message after the photo is saved (or fails). */
  onDone: (message: string, ok: boolean) => void
}

export default function AdminPhotoButton({ entry, onDone }: Props) {
  const supabase = useSupabase()
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const { blob, contentType } = await prepareImageForUpload(file, { maxDim: 1600 })
      const publicUrl = await uploadPublicImage(supabase, {
        bucket: 'floats',
        // Unique name per upload so the CDN never serves a stale photo.
        path: `entry-${entry.entry_number}-${Date.now()}.jpg`,
        blob,
        contentType,
      })
      const { error: updateError } = await supabase
        .from('entries')
        .update({ image_url: publicUrl })
        .eq('id', entry.id)
      if (updateError) throw updateError
      onDone(`Photo updated for ${entry.theme || entry.street} 📷`, true)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      onDone(`Photo upload failed: ${detail}`, false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PhotoPicker
      onFile={handleFile}
      busy={busy}
      className="rounded-full bg-fg/80 px-3 py-1.5 text-[11px] font-bold tracking-wider text-bg uppercase ring-1 ring-bg/25 backdrop-blur transition hover:bg-fg disabled:opacity-60"
    >
      📷 Photo
    </PhotoPicker>
  )
}
