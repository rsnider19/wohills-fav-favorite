import { describe, expect, it } from 'vitest'
import { detectMapsPlatform, directionsUrl } from './directions'

const dest = { lat: 40.1234567, lng: -83.0123456, label: '123 Candlewood Dr, Columbus, OH' }

describe('directionsUrl', () => {
  it('Apple Maps routes by coordinates with the address as label', () =>
    expect(directionsUrl(dest, 'apple')).toBe(
      'https://maps.apple.com/?daddr=40.123457,-83.012346&q=123%20Candlewood%20Dr%2C%20Columbus%2C%20OH',
    ))
  it('Apple Maps without a label', () =>
    expect(directionsUrl({ lat: 40, lng: -83 }, 'apple')).toBe('https://maps.apple.com/?daddr=40.000000,-83.000000'))
  it('Google Maps routes by coordinates', () =>
    expect(directionsUrl(dest, 'google')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.123457,-83.012346',
    ))
})

describe('detectMapsPlatform', () => {
  const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints })
  it.each([
    [nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5), 'apple'],
    [nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), 'apple'], // iPadOS
    [nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), 'google'], // desktop Mac
    [nav('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Linux armv8l', 5), 'google'],
    [nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0), 'google'],
  ] as const)('%#', (n, out) => expect(detectMapsPlatform(n)).toBe(out))
})
