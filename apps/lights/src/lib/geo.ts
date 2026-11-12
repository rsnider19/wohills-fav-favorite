import type { LightsSettings } from '../types'

export interface LatLng {
  lat: number
  lng: number
}

export interface Box {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/** The contest geofence from lights.settings (the database checks the same box). */
export function geofence(s: Pick<LightsSettings, 'geofence_min_lat' | 'geofence_max_lat' | 'geofence_min_lng' | 'geofence_max_lng'>): Box {
  return { minLat: s.geofence_min_lat, maxLat: s.geofence_max_lat, minLng: s.geofence_min_lng, maxLng: s.geofence_max_lng }
}

/** Inclusive, like lights.in_geofence(). */
export function inBox(p: LatLng, b: Box): boolean {
  return p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng
}

export function boxCenter(b: Box): LatLng {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 }
}

/** The box grown by `meters` on every side (the mini-map's pan limit, so the pin can
 *  still reach the geofence edge). */
export function padBox(b: Box, meters: number): Box {
  const dLat = meters / 111_320
  const dLng = meters / (111_320 * Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180))
  return { minLat: b.minLat - dLat, maxLat: b.maxLat + dLat, minLng: b.minLng - dLng, maxLng: b.maxLng + dLng }
}

/** Six decimals (~10 cm): plenty for a house, and stable through JSON round trips. */
export function roundPoint(p: LatLng): LatLng {
  const r = (v: number) => Math.round(v * 1e6) / 1e6
  return { lat: r(p.lat), lng: r(p.lng) }
}

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/** Google Maps at a point (the admin's "check the pin" link). */
export function mapsSearchUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}
