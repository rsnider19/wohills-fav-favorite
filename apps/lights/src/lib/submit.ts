import { uploadPublicImage, type AnySupabaseClient } from '@wohills/core'
import type { EntryRow } from '../types'
import { photoPath } from './entry'
import { roundPoint, type LatLng } from './geo'

export const ENTRY_COLUMNS = 'id, entry_number, title, address, lat, lng, photo_url, submitted_by, status, created_at, updated_at'

const BUCKET = 'houses'

/** A photo that went through prepareImageForUpload() (resized JPEG, EXIF stripped). */
export interface PreparedPhoto {
  blob: Blob
  contentType: string
}

/** What the form produces. `photo` is null when an edit keeps the current photo. */
export interface EntryDraft {
  photo: PreparedPhoto | null
  address: string
  point: LatLng
  title: string | null
}

/** The owner's edit was refused because owner edits are locked (voting opened, or entries
 *  closed): RLS filters the row, so PostgREST answers with zero rows and no error (M3 D9). */
export class EntryLockedError extends Error {
  constructor() {
    super('entry is locked')
    this.name = 'EntryLockedError'
  }
}

export type Stage = 'upload' | 'save'

interface Options {
  onStage?: (stage: Stage) => void
  now?: () => number
  random?: () => string
}

/** Columns an edit would change (an empty object means nothing to save). Pure. */
export function changedFields(house: EntryRow, draft: EntryDraft): Partial<Pick<EntryRow, 'address' | 'lat' | 'lng' | 'title'>> {
  const p = roundPoint(draft.point)
  const out: Partial<Pick<EntryRow, 'address' | 'lat' | 'lng' | 'title'>> = {}
  if (draft.address !== house.address) out.address = draft.address
  if (p.lat !== house.lat || p.lng !== house.lng) {
    out.lat = p.lat
    out.lng = p.lng
  }
  if (draft.title !== house.title) out.title = draft.title
  return out
}

async function upload(client: AnySupabaseClient, uid: string, photo: PreparedPhoto, o: Options) {
  const path = photoPath(uid, (o.now ?? Date.now)(), (o.random ?? (() => crypto.randomUUID()))())
  const url = await uploadPublicImage(client, { bucket: BUCKET, path, ...photo })
  return { path, url }
}

/** Best effort: storage refuses (silently, zero rows) whatever the owner may not delete. */
async function removeQuietly(client: AnySupabaseClient, paths: string[]) {
  if (paths.length === 0) return
  try {
    await client.storage.from(BUCKET).remove(paths)
  } catch {
    // An orphan in the owner's own folder is harmless (unlisted, unguessable name).
  }
}

/** Remove every object in the owner's folder except the photo their entry shows now,
 *  which the storage policy protects anyway (M3 R2). Clears photos left by a replaced
 *  photo, a withdrawn entry or an attempt that died between upload and save. Works only
 *  while owner edits are allowed (before voting opens); after that the policy keeps them. */
export async function sweepOrphans(client: AnySupabaseClient, uid: string, keep: string | null) {
  try {
    const { data } = await client.storage.from(BUCKET).list(uid, { limit: 100 })
    const paths = (data ?? []).map((f) => `${uid}/${f.name}`).filter((p) => p !== keep)
    await removeQuietly(client, paths)
  } catch {
    // Best effort.
  }
}

/** New entry. Order matters (M3 "Notes"): the photo must already exist in the owner's
 *  folder when the row is inserted, so upload first, then insert; if the insert fails,
 *  delete the upload again. Throws the Supabase error (see entryErrorKind). */
export async function submitEntry(client: AnySupabaseClient, uid: string, draft: EntryDraft, o: Options = {}): Promise<EntryRow> {
  if (!draft.photo) throw new Error('a new entry needs a photo')
  o.onStage?.('upload')
  const { path, url } = await upload(client, uid, draft.photo, o)
  o.onStage?.('save')
  const p = roundPoint(draft.point)
  const { data, error } = await client
    .from('houses')
    .insert({ address: draft.address, lat: p.lat, lng: p.lng, photo_url: url, title: draft.title })
    .select(ENTRY_COLUMNS)
    .single<EntryRow>()
  if (error) {
    await removeQuietly(client, [path])
    throw error
  }
  await sweepOrphans(client, uid, path)
  return data
}

/** The owner's edit. A new photo is uploaded first, then the row points at it, then the
 *  old photo is removed: storage won't let an owner delete the photo their entry still
 *  shows (M3 R2), and the row can't point at a photo that isn't uploaded yet (M3 R3).
 *  Any change sends an approved entry back to pending (the database trigger does that). */
export async function updateEntry(client: AnySupabaseClient, house: EntryRow, draft: EntryDraft, o: Options = {}): Promise<EntryRow> {
  const uid = house.submitted_by
  const patch: Record<string, unknown> = changedFields(house, draft)
  let uploaded: string | null = null
  if (draft.photo) {
    o.onStage?.('upload')
    const { path, url } = await upload(client, uid, draft.photo, o)
    uploaded = path
    patch.photo_url = url
  }
  if (Object.keys(patch).length === 0) return house
  o.onStage?.('save')
  const { data, error } = await client.from('houses').update(patch).eq('id', house.id).select(ENTRY_COLUMNS)
  if (error || !data?.length) {
    if (uploaded) await removeQuietly(client, [uploaded])
    throw error ?? new EntryLockedError()
  }
  if (uploaded) await sweepOrphans(client, uid, uploaded)
  return data[0] as EntryRow
}

/** Withdraw: delete the row first (that cascades nothing before voting opens: there are no
 *  votes yet), then its photos, which storage only allows once no entry shows them. */
export async function withdrawEntry(client: AnySupabaseClient, house: EntryRow): Promise<void> {
  const { data, error } = await client.from('houses').delete().eq('id', house.id).select('id')
  if (error) throw error
  if (!data?.length) throw new EntryLockedError()
  await sweepOrphans(client, house.submitted_by, null)
}
