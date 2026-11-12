import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { uploadPublicImage, usePolling, useSupabase, type AnySupabaseClient } from '@wohills/core'
import type { EntryRow, HouseStatus } from '../types'
import { objectNameFromUrl, photoPath } from './entry'
import { roundPoint, type LatLng } from './geo'
import { ENTRY_COLUMNS, type PreparedPhoto } from './submit'

/** The signed-in phone's own entry, any status. `entry` is undefined until known (signed
 *  out, or still loading), then the row or null. Polled every 30 s so "pending" turns into
 *  "on the board" without a reload once the admin approves it. */
export function useMyEntry(session: Session | null): { entry: EntryRow | null | undefined; refresh: () => Promise<void> } {
  const client = useSupabase()
  const uid = session?.user.id ?? null
  const { data, refresh } = usePolling(
    async () => {
      if (!uid) return null
      const { data, error } = await client.from('houses').select(ENTRY_COLUMNS).eq('submitted_by', uid).maybeSingle<EntryRow>()
      if (error) throw error
      // Tagged with the user, so a previous account's entry never shows after a switch.
      return { uid, entry: data }
    },
    { enabled: uid !== null },
  )
  return { entry: data && data.uid === uid ? data.entry : undefined, refresh }
}

/** Whether the signed-in phone is the admin: undefined while asking (core's useIsAdmin
 *  says false until it knows, which would flash "not the admin" on /admin). */
export function useAdminCheck(session: Session | null): boolean | undefined {
  const client = useSupabase()
  const uid = session?.user.id ?? null
  const [answer, setAnswer] = useState<{ uid: string; admin: boolean } | null>(null)
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    client
      .schema('public')
      .rpc('is_admin')
      .then(({ data }) => {
        if (!cancelled) setAnswer({ uid, admin: data === true })
      })
    return () => {
      cancelled = true
    }
  }, [client, uid])
  if (!uid) return false
  return answer?.uid === uid ? answer.admin : undefined
}

/** Every house, for the admin (their select policy returns all statuses; M3 D9).
 *  Status changes are optimistic: the row moves to its new list at once, and goes back
 *  (with the error rethrown) if the database refuses. */
export function useAdminEntries(enabled: boolean) {
  const client = useSupabase()
  const { data, loading, refresh } = usePolling(
    async () => {
      const { data, error } = await client.from('houses').select(ENTRY_COLUMNS).order('created_at')
      if (error) throw error
      return data as EntryRow[]
    },
    { enabled },
  )
  const [optimistic, setOptimistic] = useState<Record<string, HouseStatus>>({})
  const rows = data?.map((r) => (optimistic[r.id] ? { ...r, status: optimistic[r.id] } : r))

  const setStatus = useCallback(
    async (id: string, status: HouseStatus) => {
      setOptimistic((o) => ({ ...o, [id]: status }))
      try {
        await setEntryStatus(client, id, status)
        await refresh()
      } finally {
        setOptimistic((o) => {
          const next = { ...o }
          delete next[id]
          return next
        })
      }
    },
    [client, refresh],
  )
  return { rows, loading, refresh, setStatus }
}

/** Throws if the database refused (e.g. the phone is no longer the admin: zero rows). */
export async function setEntryStatus(client: AnySupabaseClient, id: string, status: HouseStatus) {
  const { data, error } = await client.from('houses').update({ status }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed')
}

export interface AdminEdit {
  title: string | null
  address: string
  point: LatLng
  photo: PreparedPhoto | null
}

/** The admin's edit of any entry, at any time (M3 D13). A replacement photo goes into the
 *  owner's folder as `admin-…` (the admin is exempt from the folder rule), then the row
 *  points at it, then the old photo is deleted. Status is left alone: the admin decides. */
export async function adminEditEntry(
  client: AnySupabaseClient,
  row: EntryRow,
  edit: AdminEdit,
  { now = Date.now, random = () => crypto.randomUUID() }: { now?: () => number; random?: () => string } = {},
): Promise<void> {
  const p = roundPoint(edit.point)
  const patch: Record<string, unknown> = {}
  if (edit.title !== row.title) patch.title = edit.title
  if (edit.address !== row.address) patch.address = edit.address
  if (p.lat !== row.lat || p.lng !== row.lng) Object.assign(patch, p)
  let uploaded: string | null = null
  if (edit.photo) {
    uploaded = photoPath(row.submitted_by, now(), random()).replace(/\/(?=[^/]+$)/, '/admin-')
    patch.photo_url = await uploadPublicImage(client, { bucket: 'houses', path: uploaded, ...edit.photo })
  }
  if (Object.keys(patch).length === 0) return
  const { data, error } = await client.from('houses').update(patch).eq('id', row.id).select('id')
  if (error || !data?.length) {
    if (uploaded) await client.storage.from('houses').remove([uploaded])
    throw error ?? new Error('not allowed')
  }
  const old = objectNameFromUrl(row.photo_url)
  if (uploaded && old) await client.storage.from('houses').remove([old])
}

/** Delete an entry for good (frees the phone and the address; cascades its votes), then
 *  its owner's photos. The UI only offers this for hidden entries. */
export async function adminDeleteEntry(client: AnySupabaseClient, row: EntryRow): Promise<void> {
  const { data, error } = await client.from('houses').delete().eq('id', row.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('not allowed')
  const { data: files } = await client.storage.from('houses').list(row.submitted_by, { limit: 100 })
  const paths = (files ?? []).map((f) => `${row.submitted_by}/${f.name}`)
  if (paths.length) await client.storage.from('houses').remove(paths)
}
