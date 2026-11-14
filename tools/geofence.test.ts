import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LIGHTS_SETTINGS } from '../apps/lights/src/lib/phase'
import { parseGeofencePolygon } from './geofence-polygon.mjs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const geojson = read('../supabase/geofence/worthington-hills.geojson')
const parsed = parseGeofencePolygon(geojson)

describe('the geofence has one source of truth', () => {
  it('is the same shape in the GeoJSON file, the migration and the app default', () => {
    const migration = read('../supabase/migrations/20261114000000_lights_geofence_polygon.sql')
    const literal = /geofence_polygon = '(\[[^']+\])'::jsonb/.exec(migration)?.[1]
    expect(literal, 'polygon literal in the migration').toBeDefined()
    expect(JSON.parse(literal!)).toEqual(parsed.geofence_polygon)
    expect(DEFAULT_LIGHTS_SETTINGS.geofence_polygon).toEqual(parsed.geofence_polygon)
  })
  it('has the same bounding box in the migration and the app default', () => {
    const migration = read('../supabase/migrations/20261114000000_lights_geofence_polygon.sql')
    for (const key of ['min_lat', 'max_lat', 'min_lng', 'max_lng'] as const) {
      const value = new RegExp(`geofence_${key} = (-?[0-9.]+)`).exec(migration)?.[1]
      const column = `geofence_${key}` as const
      expect(Number(value), column).toBe(parsed[column])
      expect(DEFAULT_LIGHTS_SETTINGS[column], column).toBe(parsed[column])
    }
  })
})

describe('parseGeofencePolygon', () => {
  const ring = [[-83.1, 40.1], [-83.0, 40.1], [-83.0, 40.2], [-83.1, 40.1]]
  const polygon = { type: 'Polygon', coordinates: [ring] }

  it('swaps [lng, lat] to [lat, lng] and derives the box', () => {
    expect(parseGeofencePolygon(JSON.stringify(polygon))).toEqual({
      geofence_min_lat: 40.1,
      geofence_max_lat: 40.2,
      geofence_min_lng: -83.1,
      geofence_max_lng: -83.0,
      geofence_polygon: [[40.1, -83.1], [40.1, -83.0], [40.2, -83.0], [40.1, -83.1]],
    })
  })
  it('accepts an open ring as well as a closed one', () => {
    const open = { type: 'Polygon', coordinates: [ring.slice(0, -1)] }
    expect(parseGeofencePolygon(JSON.stringify(open)).geofence_polygon).toEqual([[40.1, -83.1], [40.1, -83.0], [40.2, -83.0]])
  })
  it('accepts a concave ring (an L shape)', () => {
    const l = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]
    expect(parseGeofencePolygon(JSON.stringify({ type: 'Polygon', coordinates: [l] })).geofence_polygon).toHaveLength(7)
  })
  it('names the problem with a MultiPolygon and with holes', () => {
    expect(() => parseGeofencePolygon(JSON.stringify({ type: 'MultiPolygon', coordinates: [[ring]] }))).toThrow(/Polygon/)
    expect(() => parseGeofencePolygon(JSON.stringify({ type: 'Polygon', coordinates: [ring, ring] }))).toThrow(/no holes/)
  })
  it('accepts a Feature and a one-feature collection', () => {
    const feature = { type: 'Feature', properties: {}, geometry: polygon }
    expect(parseGeofencePolygon(JSON.stringify(feature))).toEqual(parseGeofencePolygon(JSON.stringify(polygon)))
    const collection = { type: 'FeatureCollection', features: [feature] }
    expect(parseGeofencePolygon(JSON.stringify(collection))).toEqual(parseGeofencePolygon(JSON.stringify(polygon)))
  })
  it.each([
    ['not JSON', '{'],
    ['a Point', JSON.stringify({ type: 'Point', coordinates: [1, 2] })],
    ['a MultiPolygon', JSON.stringify({ type: 'MultiPolygon', coordinates: [[ring]] })],
    ['holes', JSON.stringify({ type: 'Polygon', coordinates: [ring, ring] })],
    ['2 vertices', JSON.stringify({ type: 'Polygon', coordinates: [ring.slice(0, 2)] })],
    ['a 3-number vertex', JSON.stringify({ type: 'Polygon', coordinates: [[[-83.1, 40.1, 5], ...ring.slice(1)]] })],
    ['a string vertex', JSON.stringify({ type: 'Polygon', coordinates: [[[-83.1, '40.1'], ...ring.slice(1)]] })],
    ['lat 95', JSON.stringify({ type: 'Polygon', coordinates: [[[-83.1, 95], ...ring.slice(1)]] })],
    ['an empty collection', JSON.stringify({ type: 'FeatureCollection', features: [] })],
    ['a bow tie (edges cross)', JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] })],
    ['a ring that touches itself', JSON.stringify({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 1], [0, 0]]] })],
  ])('rejects %s', (_name, text) => {
    expect(() => parseGeofencePolygon(text)).toThrow()
  })
})
