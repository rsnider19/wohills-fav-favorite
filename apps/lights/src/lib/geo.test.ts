import { describe, expect, it } from 'vitest'
import { boxCenter, distanceMeters, geofence, inBox, mapsSearchUrl, padBox, pointsBox, roundPoint } from './geo'
import { DEFAULT_LIGHTS_SETTINGS } from './phase'

const box = geofence(DEFAULT_LIGHTS_SETTINGS)
const candlewood = { lat: 40.12314, lng: -83.05157 }

describe('geofence', () => {
  it('reads the four settings columns', () => {
    expect(box).toEqual({ minLat: 40.1175, maxLat: 40.145, minLng: -83.067, maxLng: -83.0305 })
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
