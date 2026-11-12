import { describe, expect, it } from 'vitest'
import type { AnySupabaseClient } from '@wohills/core'
import type { EntryRow } from '../types'
import { changedFields, EntryLockedError, submitEntry, updateEntry, withdrawEntry, type EntryDraft } from './submit'

const UID = 'c8a0ccdb-3b34-4bb7-9a04-7afeec552b2b'
const ORIGIN = 'http://127.0.0.1:55321/storage/v1/object/public/houses/'
const opts = { now: () => 1000, random: () => 'abc' }
const NEW_PATH = `${UID}/1000-abc.jpg`

type Result = { data?: unknown; error?: unknown }

/** A stand-in Supabase client that records every call in order. */
function fakeClient(results: { insert?: Result; update?: Result; delete?: Result; upload?: Result; list?: string[] } = {}) {
  const calls: string[] = []
  const query = (op: string, payload?: unknown) => {
    calls.push(payload === undefined ? op : `${op} ${JSON.stringify(payload)}`)
    const result = results[op as 'insert' | 'update' | 'delete'] ?? { data: op === 'insert' ? { id: 'h1' } : [{ id: 'h1' }], error: null }
    const chain = {
      eq: () => chain,
      select: () => chain,
      single: () => Promise.resolve(result),
      then: (resolve: (r: Result) => unknown) => Promise.resolve(result).then(resolve),
    }
    return chain
  }
  const client = {
    from: () => ({
      insert: (row: unknown) => query('insert', row),
      update: (patch: unknown) => query('update', patch),
      delete: () => query('delete'),
    }),
    storage: {
      from: () => ({
        upload: (path: string) => {
          calls.push(`upload ${path}`)
          return Promise.resolve(results.upload ?? { data: { path }, error: null })
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: ORIGIN + path } }),
        list: (folder: string) => {
          calls.push(`list ${folder}`)
          return Promise.resolve({ data: (results.list ?? []).map((name) => ({ name })), error: null })
        },
        remove: (paths: string[]) => {
          calls.push(`remove ${paths.join(',')}`)
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
  }
  return { client: client as unknown as AnySupabaseClient, calls }
}

const photo = { blob: new Blob(['x']), contentType: 'image/jpeg' }
const draft: EntryDraft = { photo, address: '1221 Candlewood Dr', point: { lat: 40.1231449, lng: -83.0515712 }, title: null }
const house: EntryRow = {
  id: 'h1',
  entry_number: 9,
  title: null,
  address: '1221 Candlewood Dr',
  lat: 40.123145,
  lng: -83.051571,
  photo_url: `${ORIGIN}${UID}/1-old.jpg`,
  submitted_by: UID,
  status: 'approved',
  created_at: '2026-11-29T01:00:00Z',
  updated_at: '2026-11-29T01:00:00Z',
}

describe('submitEntry', () => {
  it('uploads first, then inserts the public URL of that upload, then sweeps leftovers', async () => {
    const { client, calls } = fakeClient({ list: ['1000-abc.jpg', '5-leftover.jpg'] })
    await submitEntry(client, UID, draft, opts)
    expect(calls).toEqual([
      `upload ${NEW_PATH}`,
      `insert ${JSON.stringify({ address: '1221 Candlewood Dr', lat: 40.123145, lng: -83.051571, photo_url: ORIGIN + NEW_PATH, title: null })}`,
      `list ${UID}`,
      `remove ${UID}/5-leftover.jpg`,
    ])
  })
  it('removes its upload when the insert fails, and rethrows', async () => {
    const error = { code: '23505', message: 'duplicate key value violates unique constraint "houses_address_key_key"' }
    const { client, calls } = fakeClient({ insert: { data: null, error } })
    await expect(submitEntry(client, UID, draft, opts)).rejects.toBe(error)
    expect(calls.at(-1)).toBe(`remove ${NEW_PATH}`)
  })
  it('never inserts when the upload fails', async () => {
    const error = { statusCode: '403', message: 'new row violates row-level security policy' }
    const { client, calls } = fakeClient({ upload: { data: null, error } })
    await expect(submitEntry(client, UID, draft, opts)).rejects.toBe(error)
    expect(calls).toEqual([`upload ${NEW_PATH}`])
  })
})

describe('updateEntry', () => {
  it('saves nothing when nothing changed', async () => {
    const { client, calls } = fakeClient()
    const same = await updateEntry(client, house, { ...draft, photo: null }, opts)
    expect(same).toBe(house)
    expect(calls).toEqual([])
  })
  it('sends only the changed columns', async () => {
    const { client, calls } = fakeClient()
    await updateEntry(client, house, { ...draft, photo: null, title: 'Sparkle Manor' }, opts)
    expect(calls).toEqual([`update ${JSON.stringify({ title: 'Sparkle Manor' })}`])
  })
  it('replaces a photo: upload, point the row at it, then remove the old one', async () => {
    const { client, calls } = fakeClient({ list: ['1-old.jpg', '1000-abc.jpg'] })
    await updateEntry(client, house, draft, opts)
    expect(calls).toEqual([
      `upload ${NEW_PATH}`,
      `update ${JSON.stringify({ photo_url: ORIGIN + NEW_PATH })}`,
      `list ${UID}`,
      `remove ${UID}/1-old.jpg`,
    ])
  })
  it('reports a lock (zero rows) and cleans up the unused upload', async () => {
    const { client, calls } = fakeClient({ update: { data: [], error: null } })
    await expect(updateEntry(client, house, draft, opts)).rejects.toBeInstanceOf(EntryLockedError)
    expect(calls.at(-1)).toBe(`remove ${NEW_PATH}`)
  })
})

describe('withdrawEntry', () => {
  it('deletes the row before its photos', async () => {
    const { client, calls } = fakeClient({ list: ['1-old.jpg'] })
    await withdrawEntry(client, house)
    expect(calls).toEqual(['delete', `list ${UID}`, `remove ${UID}/1-old.jpg`])
  })
  it('reports a lock and leaves the photos alone', async () => {
    const { client, calls } = fakeClient({ delete: { data: [], error: null } })
    await expect(withdrawEntry(client, house)).rejects.toBeInstanceOf(EntryLockedError)
    expect(calls).toEqual(['delete'])
  })
})

describe('changedFields', () => {
  it('compares the rounded pin', () => {
    expect(changedFields(house, { ...draft, photo: null })).toEqual({})
    expect(changedFields(house, { ...draft, photo: null, point: { lat: 40.1232, lng: -83.051571 } })).toEqual({
      lat: 40.1232,
      lng: -83.051571,
    })
  })
})
