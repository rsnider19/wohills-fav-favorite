// Pure helpers for the geocode Edge Function. No Deno or network APIs here, so
// vitest (root `npm test`) can import this file directly.

export interface Geofence {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  /** [lat, lng] vertices (open or closed ring); absent means the box alone applies. */
  polygon?: [number, number][]
}

export interface GeocodeMatch {
  lat: number
  lng: number
  /** The Census Bureau's normalized address, e.g. "1221 CANDLEWOOD DR, COLUMBUS, OH, 43235". */
  matchedAddress: string
}

export const CENSUS_DEFAULT_BASE = 'https://geocoding.geo.census.gov'

/** Worthington Hills is all ZIP 43235 (Columbus). Appended when the user typed no ZIP. */
export const DEFAULT_LOCALITY = 'Columbus, OH 43235'

/** The Census API rejects one-line addresses longer than 100 characters. */
const CENSUS_MAX_CHARS = 100
const MIN_CHARS = 5

/**
 * Validates the request body and returns the one-line address to send to the
 * Census geocoder, or null if it isn't usable. Requires a house number (a
 * digit). Adds the default locality when no 5-digit ZIP is present.
 */
export function toCensusAddress(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = (body as { address?: unknown }).address
  if (typeof raw !== 'string') return null
  // Collapse whitespace and drop control characters.
  // eslint-disable-next-line no-control-regex
  const address = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (address.length < MIN_CHARS || !/\d/.test(address)) return null
  const full = /\b\d{5}(?:-\d{4})?\b/.test(address) ? address : `${address}, ${DEFAULT_LOCALITY}`
  return full.length <= CENSUS_MAX_CHARS ? full : null
}

export function censusUrl(oneLineAddress: string, base = CENSUS_DEFAULT_BASE): string {
  const url = new URL('/geocoder/locations/onelineaddress', base)
  url.searchParams.set('address', oneLineAddress)
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('format', 'json')
  return url.toString()
}

/** Ray casting; an open or closed ring both work. Mirrors lights.in_geofence(). */
function inPolygon(point: { lat: number; lng: number }, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i]
    const [latJ, lngJ] = ring[j]
    if (latI > point.lat !== latJ > point.lat && point.lng < ((lngJ - lngI) * (point.lat - latI)) / (latJ - latI) + lngI)
      inside = !inside
  }
  return inside
}

/** Inside the box AND, when there is one, the polygon. */
export function inGeofence(point: { lat: number; lng: number }, fence: Geofence): boolean {
  const inBox =
    point.lat >= fence.minLat && point.lat <= fence.maxLat && point.lng >= fence.minLng && point.lng <= fence.maxLng
  return inBox && (!fence.polygon || inPolygon(point, fence.polygon))
}

/**
 * Picks the best match from a Census response: the first match inside the
 * geofence (box and polygon), else the first match. Returns null for no matches. Throws if the
 * payload isn't the documented shape (the caller maps that to a 502).
 */
export function pickMatch(payload: unknown, fence: Geofence): GeocodeMatch | null {
  const matches = (payload as { result?: { addressMatches?: unknown } })?.result?.addressMatches
  if (!Array.isArray(matches)) throw new Error('unexpected Census response')
  const parsed: GeocodeMatch[] = matches.flatMap((m) => {
    const x = m?.coordinates?.x
    const y = m?.coordinates?.y
    if (typeof x !== 'number' || typeof y !== 'number' || typeof m?.matchedAddress !== 'string') return []
    return [{ lat: y, lng: x, matchedAddress: m.matchedAddress }]
  })
  return parsed.find((m) => inGeofence(m, fence)) ?? parsed[0] ?? null
}

const isVertex = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Settings row (snake_case columns) to a Geofence; null if any bound is missing. A missing
 *  polygon (null) means the box alone; a malformed one (the database check forbids it) is
 *  treated as unreadable settings, never silently as "no polygon". */
export function toGeofence(row: unknown): Geofence | null {
  const r = row as Record<string, unknown> | null
  const box = {
    minLat: r?.geofence_min_lat,
    maxLat: r?.geofence_max_lat,
    minLng: r?.geofence_min_lng,
    maxLng: r?.geofence_max_lng,
  }
  if (!Object.values(box).every((v) => typeof v === 'number')) return null
  const polygon = r?.geofence_polygon
  if (polygon === null || polygon === undefined) return box as Geofence
  if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(isVertex)) return null
  return { ...(box as Geofence), polygon }
}

/**
 * Sliding-window limiter keyed by user id. Per isolate, so it is best effort:
 * it stops a runaway client loop, not a determined attacker (who would still
 * need a phone-verified account).
 */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit; returns 0 when allowed, else the seconds to wait. */
  take(key: string, now = Date.now()): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return Math.ceil((recent[0] + this.windowMs - now) / 1000)
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.hits.clear() // bound memory on a long-lived isolate
    return 0
  }
}
