// Pure rules for the entry form, mirroring the database (M3 D6) so mistakes show up
// before anything is uploaded. The database stays the authority.

export const ADDRESS_MIN = 5
export const ADDRESS_MAX = 200
export const TITLE_MAX = 60

/** Collapse whitespace and trim. */
export const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()

export type AddressProblem = 'empty' | 'short' | 'long' | 'number'

/** Why an address can't be submitted, or null if it can. A house number is required:
 *  the geocoder needs it and every house in the Hills has one. */
export function addressProblem(raw: string): AddressProblem | null {
  const a = tidy(raw)
  if (!a) return 'empty'
  if (a.length < ADDRESS_MIN) return 'short'
  if (a.length > ADDRESS_MAX) return 'long'
  if (!/^\d+[a-z]?\s/i.test(a)) return 'number'
  return null
}

/** The optional display name: tidied, null when empty. */
export function titleValue(raw: string): string | null {
  const t = tidy(raw)
  return t ? t : null
}

export const titleTooLong = (raw: string) => tidy(raw).length > TITLE_MAX

/** A new, unique object name in the owner's folder. The database accepts only
 *  `<uid>/<[A-Za-z0-9][A-Za-z0-9._-]*>` (M3 R3) and nobody can overwrite an object, so every
 *  upload gets a fresh name (which also keeps the CDN from serving a stale photo). */
export function photoPath(uid: string, now: number, random: string): string {
  return `${uid}/${now}-${random.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}.jpg`
}

/** The object name inside the `houses` bucket for one of its public URLs, or null. */
export function objectNameFromUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/houses/'
  const i = url.indexOf(marker)
  if (i < 0) return null
  const name = url.slice(i + marker.length)
  return /^[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? name : null
}

/** What went wrong with a write, in terms the UI has copy for (M3 D26). */
export type EntryErrorKind =
  | 'already-entered' // 23505 on houses_submitted_by_key: one house per phone
  | 'duplicate-address' // 23505 on houses_address_key_key
  | 'rejected' // 42501: window closed, outside the geofence, or the photo rule
  | 'photo-too-large' // storage 413
  | 'network' // the request never got an answer
  | 'unknown'

interface ErrorLike {
  code?: unknown
  message?: unknown
  statusCode?: unknown
  status?: unknown
  name?: unknown
}

export function entryErrorKind(error: unknown): EntryErrorKind {
  const e = (error ?? {}) as ErrorLike
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  if (code === '23505' && message.includes('houses_submitted_by_key')) return 'already-entered'
  if (code === '23505' && message.includes('houses_address_key_key')) return 'duplicate-address'
  if (code === '42501' || /row-level security/i.test(message)) return 'rejected'
  const status = Number(e.statusCode ?? e.status)
  if (status === 413 || /exceeded the maximum allowed size/i.test(message)) return 'photo-too-large'
  if (error instanceof TypeError || /failed to fetch|network|load failed/i.test(message)) return 'network'
  return 'unknown'
}
