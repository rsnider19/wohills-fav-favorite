import { describe, expect, it } from 'vitest'
import { boxCenter, distanceMeters, geofence, inBox, inGeofence, mapsSearchUrl, padBox, pointsBox, roundPoint } from './geo'
import { DEFAULT_LIGHTS_SETTINGS } from './phase'

const box = geofence(DEFAULT_LIGHTS_SETTINGS)
const candlewood = { lat: 40.12314, lng: -83.05157 }

describe('geofence', () => {
  it('reads the four settings columns', () => {
    expect(box).toEqual({ minLat: 40.1179, maxLat: 40.13877, minLng: -83.06427, maxLng: -83.03402 })
  })
  it('contains a real Worthington Hills house and not downtown Columbus', () => {
    expect(inBox(candlewood, box)).toBe(true)
    expect(inBox({ lat: 39.9612, lng: -82.9988 }, box)).toBe(false)
  })
  it('is inclusive on the edges, like lights.in_geofence()', () => {
    expect(inBox({ lat: box.minLat, lng: box.maxLng }, box)).toBe(true)
    expect(inBox({ lat: box.minLat - 1e-7, lng: box.maxLng }, box)).toBe(false)
  })
  it('has its center inside', () => {
    expect(inBox(boxCenter(box), box)).toBe(true)
  })
  it('pads by about the requested distance', () => {
    const p = padBox(box, 1000)
    expect(distanceMeters({ lat: box.maxLat, lng: box.minLng }, { lat: p.maxLat, lng: box.minLng })).toBeCloseTo(1000, -1)
    expect(distanceMeters({ lat: 40.13, lng: box.maxLng }, { lat: 40.13, lng: p.maxLng })).toBeCloseTo(1000, -1)
  })
})

// The reference points from docs/milestones/geofence-polygon.md.
const REFERENCE: [string, number, number, boolean][] = [
  ['Candlewood Dr', 40.1231, -83.0516, true],
  ['Fairway Dr & Oakview Dr', 40.13131, -83.05912, true],
  ['Fairway Dr & Dollivor Dr', 40.13774, -83.06033, true],
  ['Evangeline Dr & Dollivor Dr', 40.13772, -83.06239, true],
  ['Highview Dr, west end', 40.12847, -83.04337, true],
  ['Gatehouse Ln', 40.1188, -83.038, true],
  ['Colony Way & Clubview Blvd S', 40.12235, -83.04469, true],
  ['Darrow Dr & Nimitz Dr', 40.13193, -83.06264, false],
  ['Waco Ln & Nimitz Dr', 40.12969, -83.06217, false],
  ['Churchill Dr & Derby Dr', 40.13955, -83.06074, false],
  ['Old Woods Farm', 40.131, -83.04, false],
  ['Hickory Bluff park', 40.135, -83.05, false],
  ['Hard Rd & Sefton Park Dr', 40.11667, -83.04225, false],
  ['East of Route 315', 40.123, -83.033, false],
  ['Downtown Columbus', 39.9612, -82.9988, false],
]

// 3 m either side of five edges, and ~30 m outside the Route 315 edge. The same table is in
// supabase/tests/database/lights_00_schema.test.sql, so the site and lights.in_geofence() agree.
const NEAR_EDGES: [string, number, number, boolean][] = [
  ['west edge (south part), 3 m in', 40.120249, -83.059144, true],
  ['west edge (south part), 3 m out', 40.120201, -83.059176, false],
  ['Route 315 edge, 3 m in', 40.120728, -83.034952, true],
  ['Route 315 edge, 3 m out', 40.120752, -83.034888, false],
  ['Highview notch, 3 m in', 40.129079, -83.039683, true],
  ['Highview notch, 3 m out', 40.129131, -83.039697, false],
  ['Hickory Bluff edge, 3 m in', 40.133426, -83.05572, true],
  ['Hickory Bluff edge, 3 m out', 40.133424, -83.05565, false],
  ['north edge, 3 m in', 40.138437, -83.059516, true],
  ['north edge, 3 m out', 40.138463, -83.059454, false],
  ['about 30 m east of the Route 315 edge', 40.1205, -83.0344, false],
]

describe('inGeofence', () => {
  it.each(REFERENCE)('%s', (_name, lat, lng, expected) => {
    expect(inGeofence({ lat, lng }, DEFAULT_LIGHTS_SETTINGS)).toBe(expected)
  })
  it.each(NEAR_EDGES)('%s', (_name, lat, lng, expected) => {
    expect(inGeofence({ lat, lng }, DEFAULT_LIGHTS_SETTINGS)).toBe(expected)
  })
  it('gives the same answers for an open ring and a closed one', () => {
    const poly = DEFAULT_LIGHTS_SETTINGS.geofence_polygon!
    const first = poly[0]
    const last = poly[poly.length - 1]
    const open = last[0] === first[0] && last[1] === first[1] ? poly.slice(0, -1) : poly
    const closed = [...open, open[0]]
    for (const [, lat, lng] of REFERENCE) {
      const p = { lat, lng }
      expect(inGeofence(p, { ...DEFAULT_LIGHTS_SETTINGS, geofence_polygon: open })).toBe(
        inGeofence(p, { ...DEFAULT_LIGHTS_SETTINGS, geofence_polygon: closed }),
      )
    }
  })
  it('falls back to the box when the polygon is null', () => {
    const boxOnly = { ...DEFAULT_LIGHTS_SETTINGS, geofence_polygon: null }
    expect(inGeofence({ lat: 40.13193, lng: -83.06264 }, boxOnly)).toBe(true)
    expect(inGeofence({ lat: 39.9612, lng: -82.9988 }, boxOnly)).toBe(false)
  })
})

describe('points', () => {
  it('rounds to six decimals', () => {
    expect(roundPoint({ lat: 40.123456789, lng: -83.0515749 })).toEqual({ lat: 40.123457, lng: -83.051575 })
  })
  it('measures distance', () => {
    // Candlewood to Blind Brook, about 1 km apart.
    expect(distanceMeters(candlewood, { lat: 40.12927, lng: -83.04397 })).toBeGreaterThan(900)
    expect(distanceMeters(candlewood, { lat: 40.12927, lng: -83.04397 })).toBeLessThan(1000)
  })
  it('links Google Maps to the exact pin', () => {
    expect(mapsSearchUrl(candlewood)).toBe('https://www.google.com/maps/search/?api=1&query=40.123140,-83.051570')
  })
})

describe('pointsBox', () => {
  it('is null without points', () => expect(pointsBox([])).toBeNull())
  it('is a point for one house', () =>
    expect(pointsBox([{ lat: 40.12, lng: -83.05 }])).toEqual({ minLat: 40.12, maxLat: 40.12, minLng: -83.05, maxLng: -83.05 }))
  it('spans every house', () =>
    expect(
      pointsBox([
        { lat: 40.12314, lng: -83.05157 },
        { lat: 40.137, lng: -83.059 },
        { lat: 40.12474, lng: -83.04227 },
      ]),
    ).toEqual({ minLat: 40.12314, maxLat: 40.137, minLng: -83.059, maxLng: -83.04227 }))
})
