import { useState } from 'react'
import { prepareImageForUpload } from '@wohills/core'
import { PhotoPicker } from '@wohills/ui'
import { ENTER } from '../../copy'
import { Note } from '../Page'
import type { DraftPhoto } from './SubmitWizard'

interface Props {
  photo: DraftPhoto | null
  /** The entry's current photo while editing (kept unless a new one is picked). */
  currentUrl: string | null
  onPhoto: (photo: DraftPhoto) => void
  onNext: () => void
}

/** Pipeline errors (core/image) → our copy. */
function photoError(err: unknown): string {
  const m = err instanceof Error ? err.message : ''
  if (/heic/i.test(m)) return ENTER.photoErrors.heic
  if (/unsupported/i.test(m)) return ENTER.photoErrors.format
  if (/too large/i.test(m)) return ENTER.photoErrors.size
  return ENTER.photoErrors.other
}

/** Step 1: the camera (rear) or the photo library, then a preview. The photo is resized to
 *  a 1600px JPEG here, which also strips EXIF (including GPS); nothing uploads until Send. */
export function PhotoStep({ photo, currentUrl, onPhoto, onNext }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function take(file: File) {
    setBusy(true)
    setError(null)
    try {
      const prepared = await prepareImageForUpload(file)
      onPhoto({ ...prepared, previewUrl: URL.createObjectURL(prepared.blob) })
    } catch (err) {
      setError(photoError(err))
    } finally {
      setBusy(false)
    }
  }

  const shown = photo?.previewUrl ?? currentUrl
  return (
    <div className="space-y-6">
      <div>
        <h2 data-slot="step-title">{ENTER.photoTitle}</h2>
        <p className="mt-2 text-fg/75">{ENTER.photoHelp}</p>
      </div>

      <div data-slot="photo-preview" data-empty={shown ? undefined : ''} className="relative aspect-[4/3] overflow-hidden bg-sunken">
        {shown ? (
          <img src={shown} alt={ENTER.photoAlt} className="h-full w-full object-cover" />
        ) : (
          <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="1.5" width="6" height="5" rx="1" fill="#1f3a2a" />
            <path d="M8.5 6.5 C4 11 5.5 17 12 22.5 C18.5 17 20 11 15.5 6.5 Z" fill="#2a2f4d" />
          </svg>
        )}
        {busy && (
          <p data-slot="photo-busy" role="status">
            {ENTER.developing}
          </p>
        )}
      </div>

      {error && (
        <Note tone="error" live="alert">
          {error}
        </Note>
      )}

      <div className="flex flex-wrap gap-3">
        <PhotoPicker
          onFile={take}
          busy={busy}
          capture="environment"
          busyLabel={ENTER.takePhoto}
          className={shown ? 'btn-ghost' : 'btn-bulb'}
        >
          {ENTER.takePhoto}
        </PhotoPicker>
        <PhotoPicker onFile={take} busy={busy} busyLabel={shown ? ENTER.retake : ENTER.choosePhoto} className="btn-ghost">
          {shown ? ENTER.retake : ENTER.choosePhoto}
        </PhotoPicker>
      </div>

      {shown && (
        <div className="flex justify-end border-t border-fg/10 pt-6">
          <button type="button" className="btn-bulb" disabled={busy} onClick={onNext}>
            {photo || !currentUrl ? ENTER.next : ENTER.keepPhoto} <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  )
}
