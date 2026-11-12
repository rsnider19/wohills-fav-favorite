import type { AnySupabaseClient } from '@wohills/core'
import type { LatLng } from './geo'

export type LocateError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

/** One GPS fix. Rejects with a LocateError. High accuracy because we want the house,
 *  not the block; a fix up to a minute old is fine (they're standing in the driveway). */
export function currentPosition(timeoutMs = 15_000): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('unsupported' satisfies LocateError)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject((err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable') satisfies LocateError),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

export type GeocodeResult =
  | { kind: 'match'; point: LatLng; matchedAddress: string; inGeofence: boolean }
  | { kind: 'no-match' }
  | { kind: 'error'; reason: 'busy' | 'unavailable' | 'signed-out' | 'invalid' | 'network' }

/** Pure: the geocode function's answer (M3 D17) as a result the form can show. */
export function geocodeOutcome(status: number | 'network', body: unknown): GeocodeResult {
  if (status === 'network') return { kind: 'error', reason: 'network' }
  if (status === 200) {
    const b = body as { match?: { lat?: unknown; lng?: unknown; matchedAddress?: unknown }; inGeofence?: unknown } | null
    const m = b?.match
    if (typeof m?.lat === 'number' && typeof m.lng === 'number')
      return {
        kind: 'match',
        point: { lat: m.lat, lng: m.lng },
        matchedAddress: typeof m.matchedAddress === 'string' ? m.matchedAddress : '',
        inGeofence: b?.inGeofence === true,
      }
    return { kind: 'error', reason: 'unavailable' }
  }
  if (status === 404) return { kind: 'no-match' }
  if (status === 400) return { kind: 'error', reason: 'invalid' }
  if (status === 401) return { kind: 'error', reason: 'signed-out' }
  if (status === 429) return { kind: 'error', reason: 'busy' }
  return { kind: 'error', reason: 'unavailable' }
}

/** Typed address → point, through the `geocode` Edge Function (US Census, server-side
 *  geofence check). Needs a signed-in phone account; supabase-js sends its token. */
export async function geocodeAddress(client: AnySupabaseClient, address: string): Promise<GeocodeResult> {
  const { data, error } = await client.functions.invoke('geocode', { body: { address } })
  if (!error) return geocodeOutcome(200, data)
  const response = (error as { context?: unknown }).context
  if (response instanceof Response) return geocodeOutcome(response.status, await response.json().catch(() => null))
  return geocodeOutcome('network', null)
}
