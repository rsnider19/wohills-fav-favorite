import { describe, expect, it } from 'vitest'
import { RateLimiter, censusUrl, inGeofence, pickMatch, toCensusAddress, toGeofence } from './census.ts'

const BOX = { minLat: 40.1175, maxLat: 40.1450, minLng: -83.067, maxLng: -83.0305 }
// An L-shaped polygon in the box's lower-left: the box's upper-right corner is outside it.
const POLY: [number, number][] = [
  [40.1175, -83.067],
  [40.1175, -83.0305],
  [40.13, -83.0305],
  [40.13, -83.05],
  [40.145, -83.05],
  [40.145, -83.067],
]
const FENCE = { ...BOX, polygon: POLY }
const match = (x: number, y: number, a = 'X') => ({ matchedAddress: a, coordinates: { x, y } })

describe('toCensusAddress', () => {
  it('adds the neighborhood locality when no ZIP is given', () => {
    expect(toCensusAddress({ address: ' 1221  Candlewood Dr ' })).toBe('1221 Candlewood Dr, Columbus, OH 43235')
  })
  it('keeps an address that already has a ZIP', () => {
    expect(toCensusAddress({ address: '1221 Candlewood Dr, Columbus, OH 43235-1234' })).toBe(
      '1221 Candlewood Dr, Columbus, OH 43235-1234',
    )
  })
  it('rejects missing, non-string, too short, number-less and too long input', () => {
    expect(toCensusAddress(null)).toBeNull()
    expect(toCensusAddress({})).toBeNull()
    expect(toCensusAddress({ address: 42 })).toBeNull()
    expect(toCensusAddress({ address: '12 A' })).toBeNull()
    expect(toCensusAddress({ address: 'Candlewood Drive' })).toBeNull()
    expect(toCensusAddress({ address: `1 ${'x'.repeat(80)}` })).toBeNull()
  })
  it('strips control characters', () => {
    expect(toCensusAddress({ address: '1221\nCandlewood\u0000Dr 43235' })).toBe('1221 Candlewood Dr 43235')
  })
})

describe('censusUrl', () => {
  it('builds the one-line address request', () => {
    const url = new URL(censusUrl('1221 Candlewood Dr, Columbus, OH 43235'))
    expect(url.origin + url.pathname).toBe('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
    expect(url.searchParams.get('address')).toBe('1221 Candlewood Dr, Columbus, OH 43235')
    expect(url.searchParams.get('benchmark')).toBe('Public_AR_Current')
    expect(url.searchParams.get('format')).toBe('json')
  })
  it('honors a stub base URL', () => {
    expect(censusUrl('1 A St 43235', 'http://host.docker.internal:55398')).toMatch(
      /^http:\/\/host\.docker\.internal:55398\/geocoder\/locations\/onelineaddress\?/,
    )
  })
})

describe('pickMatch / inGeofence', () => {
  it('returns null when Census found nothing', () => {
    expect(pickMatch({ result: { addressMatches: [] } }, BOX)).toBeNull()
  })
  it('prefers a match inside the geofence', () => {
    const payload = { result: { addressMatches: [match(-82.99, 39.96, 'DOWNTOWN'), match(-83.0516, 40.1231, 'HOME')] } }
    expect(pickMatch(payload, BOX)).toEqual({ lat: 40.1231, lng: -83.0516, matchedAddress: 'HOME' })
  })
  it('falls back to the first match outside the geofence', () => {
    const m = pickMatch({ result: { addressMatches: [match(-82.99, 39.96, 'DOWNTOWN')] } }, BOX)
    expect(m?.matchedAddress).toBe('DOWNTOWN')
    expect(inGeofence(m!, BOX)).toBe(false)
  })
  it('throws on an unexpected payload', () => {
    expect(() => pickMatch({ errors: ['bad'] }, BOX)).toThrow()
  })
  it('treats the box edges as inside', () => {
    expect(inGeofence({ lat: BOX.minLat, lng: BOX.maxLng }, BOX)).toBe(true)
  })
})

describe('polygon', () => {
  const IN = { lat: 40.12, lng: -83.04 }
  const IN_BOX_ONLY = { lat: 40.14, lng: -83.04 }
  it('is box AND polygon', () => {
    expect(inGeofence(IN, FENCE)).toBe(true)
    expect(inGeofence(IN_BOX_ONLY, BOX)).toBe(true)
    expect(inGeofence(IN_BOX_ONLY, FENCE)).toBe(false)
    expect(inGeofence({ lat: 39.96, lng: -82.99 }, FENCE)).toBe(false)
  })
  it('gives the same answers for an open and a closed ring', () => {
    const closed = { ...BOX, polygon: [...POLY, POLY[0]] }
    for (const p of [IN, IN_BOX_ONLY, { lat: 40.141, lng: -83.06 }]) expect(inGeofence(p, closed)).toBe(inGeofence(p, FENCE))
  })
  it('does not prefer a match inside the box but outside the polygon', () => {
    const payload = {
      result: { addressMatches: [match(IN_BOX_ONLY.lng, IN_BOX_ONLY.lat, 'BOX ONLY'), match(IN.lng, IN.lat, 'HOME')] },
    }
    expect(pickMatch(payload, FENCE)?.matchedAddress).toBe('HOME')
    expect(pickMatch(payload, BOX)?.matchedAddress).toBe('BOX ONLY')
  })
  it('falls back to the first match when none is inside the polygon', () => {
    const payload = { result: { addressMatches: [match(IN_BOX_ONLY.lng, IN_BOX_ONLY.lat, 'FIRST')] } }
    const m = pickMatch(payload, FENCE)
    expect(m?.matchedAddress).toBe('FIRST')
    expect(inGeofence(m!, FENCE)).toBe(false)
  })
})

describe('toGeofence', () => {
  it('maps the settings columns', () => {
    expect(
      toGeofence({ geofence_min_lat: 1, geofence_max_lat: 2, geofence_min_lng: 3, geofence_max_lng: 4 }),
    ).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 })
  })
  it('reads the polygon, and treats null or absent as the box alone', () => {
    const row = { geofence_min_lat: 1, geofence_max_lat: 2, geofence_min_lng: 3, geofence_max_lng: 4 }
    const polygon = [[1, 3], [1, 4], [2, 4]]
    expect(toGeofence({ ...row, geofence_polygon: polygon })).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4, polygon })
    expect(toGeofence({ ...row, geofence_polygon: null })).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 })
  })
  it('treats a malformed polygon as unreadable settings', () => {
    const row = { geofence_min_lat: 1, geofence_max_lat: 2, geofence_min_lng: 3, geofence_max_lng: 4 }
    expect(toGeofence({ ...row, geofence_polygon: [[1, 3], [1, 4]] })).toBeNull()
    expect(toGeofence({ ...row, geofence_polygon: 'x' })).toBeNull()
    expect(toGeofence({ ...row, geofence_polygon: [[1, 3], [1, 4], [1, 'a']] })).toBeNull()
  })
  it('rejects a partial row', () => {
    expect(toGeofence({ geofence_min_lat: 1 })).toBeNull()
    expect(toGeofence(undefined)).toBeNull()
  })
})

describe('RateLimiter', () => {
  it('allows `limit` hits per window, then reports the wait', () => {
    const limiter = new RateLimiter(2, 60_000)
    expect(limiter.take('u', 0)).toBe(0)
    expect(limiter.take('u', 1_000)).toBe(0)
    expect(limiter.take('u', 2_000)).toBe(58)
    expect(limiter.take('other', 2_000)).toBe(0)
    expect(limiter.take('u', 60_001)).toBe(0)
  })
})
