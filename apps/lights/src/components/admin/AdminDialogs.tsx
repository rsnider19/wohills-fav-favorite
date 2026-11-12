import { useEffect, useId, useState, type FormEvent } from 'react'
import { prepareImageForUpload } from '@wohills/core'
import { Dialog, PhotoPicker } from '@wohills/ui'
import { ADMIN, ENTER } from '../../copy'
import { ADDRESS_MAX, ADDRESS_MIN, TITLE_MAX, tidy, titleValue } from '../../lib/entry'
import type { AdminEdit } from '../../lib/entries'
import type { PreparedPhoto } from '../../lib/submit'
import type { EntryRow } from '../../types'
import { Note } from '../Page'

/** The admin's edit: name, address, pin (numbers; "Check the pin" opens Google Maps) and a
 *  replacement photo. Not geofenced and no re-approval: the admin is trusted (M3 D13). */
export function AdminEditDialog({ row, onSave, onClose }: { row: EntryRow; onSave: (edit: AdminEdit) => Promise<void>; onClose: () => void }) {
  const id = useId()
  const [title, setTitle] = useState(row.title ?? '')
  const [address, setAddress] = useState(row.address)
  const [lat, setLat] = useState(String(row.lat))
  const [lng, setLng] = useState(String(row.lng))
  const [photo, setPhoto] = useState<(PreparedPhoto & { previewUrl: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  async function pick(file: File) {
    setError(null)
    try {
      const prepared = await prepareImageForUpload(file)
      setPhoto({ ...prepared, previewUrl: URL.createObjectURL(prepared.blob) })
    } catch {
      setError(ENTER.photoErrors.other)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const a = tidy(address)
    const point = { lat: Number(lat), lng: Number(lng) }
    if (a.length < ADDRESS_MIN || a.length > ADDRESS_MAX) return setError(ADMIN.addressInvalid)
    if (tidy(title).length > TITLE_MAX) return setError(ENTER.titleTooLong(TITLE_MAX))
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)
      return setError(ADMIN.pinInvalid)
    setBusy(true)
    setError(null)
    try {
      await onSave({ title: titleValue(title), address: a, point, photo })
    } catch {
      setError(ADMIN.toasts.failed)
      setBusy(false)
    }
  }

  return (
    <Dialog label={ADMIN.editTitle(row.entry_number)} onClose={() => !busy && onClose()}>
      <h2 data-slot="dialog-title">{ADMIN.editTitle(row.entry_number)}</h2>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor={`${id}-title`} data-slot="field-label">
            {ENTER.titleLabel}
          </label>
          <input id={`${id}-title`} data-slot="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-address`} data-slot="field-label">
            {ENTER.addressLabel}
          </label>
          <input id={`${id}-address`} data-slot="field" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-lat`} data-slot="field-label">
              {ADMIN.latLabel}
            </label>
            <input id={`${id}-lat`} data-slot="field" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-lng`} data-slot="field-label">
              {ADMIN.lngLabel}
            </label>
            <input id={`${id}-lng`} data-slot="field" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <img src={photo?.previewUrl ?? row.photo_url} alt="" className="h-20 w-28 flex-none bg-sunken object-cover" />
          <div className="space-y-2">
            <PhotoPicker onFile={pick} disabled={busy} className="btn-ghost">
              {ADMIN.replacePhoto}
            </PhotoPicker>
            {photo && <p className="text-sm text-fg/75">{ADMIN.photoReady}</p>}
          </div>
        </div>
        {error && (
          <Note tone="error" live="alert">
            {error}
          </Note>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn-bulb" disabled={busy}>
            {ADMIN.save}
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
            {ADMIN.cancel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** Delete for good (only offered for hidden entries). */
export function AdminDeleteDialog({ row, onConfirm, onClose }: { row: EntryRow; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }
  return (
    <Dialog label={ADMIN.deleteTitle(row.entry_number)} onClose={() => !busy && onClose()}>
      <h2 data-slot="dialog-title">{ADMIN.deleteTitle(row.entry_number)}</h2>
      <p className="mt-3 text-fg/75">{ADMIN.deleteBody}</p>
      {failed && (
        <div className="mt-4">
          <Note tone="error" live="alert">
            {ADMIN.toasts.failed}
          </Note>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-ghost" data-tone="danger" disabled={busy} onClick={confirm}>
          {ADMIN.deleteConfirm}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
          {ADMIN.cancel}
        </button>
      </div>
    </Dialog>
  )
}
