import { describe, expect, it } from 'vitest'
import { RateLimiter, censusUrl, inGeofence, pickMatch, toCensusAddress, toGeofence } from './census.ts'

const BOX = { minLat: 40.1175, maxLat: 40.1450, minLng: -83.067, maxLng: -83.0305 }
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

describe('toGeofence', () => {
  it('maps the settings columns', () => {
    expect(
      toGeofence({ geofence_min_lat: 1, geofence_max_lat: 2, geofence_min_lng: 3, geofence_max_lng: 4 }),
    ).toEqual({ minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 })
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
