import { describe, expect, it } from 'vitest'
import { geocodeOutcome } from './locate'

describe('geocodeOutcome', () => {
  it('reads a match and the geofence verdict', () => {
    const body = { match: { lat: 40.123142, lng: -83.051572, matchedAddress: '1221 CANDLEWOOD DR, COLUMBUS, OH, 43235' }, inGeofence: true }
    expect(geocodeOutcome(200, body)).toEqual({
      kind: 'match',
      point: { lat: 40.123142, lng: -83.051572 },
      matchedAddress: '1221 CANDLEWOOD DR, COLUMBUS, OH, 43235',
      inGeofence: true,
    })
    expect(geocodeOutcome(200, { ...body, inGeofence: false })).toMatchObject({ kind: 'match', inGeofence: false })
  })
  it.each([
    [404, { kind: 'no-match' }],
    [400, { kind: 'error', reason: 'invalid' }],
    [401, { kind: 'error', reason: 'signed-out' }],
    [429, { kind: 'error', reason: 'busy' }],
    [502, { kind: 'error', reason: 'unavailable' }],
    [500, { kind: 'error', reason: 'unavailable' }],
    ['network', { kind: 'error', reason: 'network' }],
  ] as const)('%s', (status, result) => {
    expect(geocodeOutcome(status, null)).toEqual(result)
  })
  it('treats a malformed 200 as unavailable', () => {
    expect(geocodeOutcome(200, { match: { lat: 'x' } })).toEqual({ kind: 'error', reason: 'unavailable' })
  })
})
