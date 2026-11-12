import { describe, expect, it } from 'vitest'
import { detectMapsDevice, detectMapsPlatform, directionsUrl } from './directions'

const dest = { lat: 40.1234567, lng: -83.0123456, label: '123 Candlewood Dr, Columbus, OH' }

describe('directionsUrl', () => {
  it('Apple Maps (iOS 18.4+) uses the unified directions URL with the coordinates', () =>
    expect(directionsUrl(dest, { platform: 'apple', legacyApple: false, handheld: true })).toBe(
      'https://maps.apple.com/directions?destination=40.123457,-83.012346',
    ))
  it('Apple Maps before iOS 18.4 uses the legacy daddr parameter', () =>
    expect(directionsUrl(dest, { platform: 'apple', legacyApple: true, handheld: true })).toBe(
      'https://maps.apple.com/?daddr=40.123457,-83.012346',
    ))
  it('a bare platform name means the current URL format', () => {
    expect(directionsUrl({ lat: 40, lng: -83 }, 'apple')).toBe('https://maps.apple.com/directions?destination=40.000000,-83.000000')
    expect(directionsUrl(dest, 'google')).toBe('https://www.google.com/maps/dir/?api=1&destination=40.123457,-83.012346')
  })
  it('Google Maps routes by coordinates', () =>
    expect(directionsUrl(dest, { platform: 'google', legacyApple: false, handheld: true })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.123457,-83.012346',
    ))
  it('never puts the label in the URL (a coordinate destination has no label)', () => {
    for (const d of ['apple', 'google'] as const) expect(directionsUrl(dest, d)).not.toContain('Candlewood')
  })
  it('rounds to 6 decimals and keeps the sign', () =>
    expect(directionsUrl({ lat: 40.1, lng: -83.0000004 }, 'google')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.100000,-83.000000',
    ))
})

// Real user agents. [label, userAgent, navigator.platform, maxTouchPoints, expected]
const IPHONE = (os: string, tail = `Version/${os.replace('_', '.')} Mobile/15E148 Safari/604.1`) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tail}`
const MAC_SAFARI = (v: string) =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Safari/605.1.15`
const apple = (legacyApple: boolean) => ({ platform: 'apple', legacyApple, handheld: true })
const google = (handheld: boolean) => ({ platform: 'google', legacyApple: false, handheld })

const CASES: [string, string, string, number, ReturnType<typeof apple | typeof google>][] = [
  ['iPhone, iOS 16.7 (iPhone 8/X)', IPHONE('16_7'), 'iPhone', 5, apple(true)],
  ['iPhone, iOS 17.5', IPHONE('17_5'), 'iPhone', 5, apple(true)],
  ['iPhone, iOS 18.3', IPHONE('18_3'), 'iPhone', 5, apple(true)],
  ['iPhone, iOS 18.4', IPHONE('18_4'), 'iPhone', 5, apple(false)],
  ['iPhone, iOS 26 (UA frozen at 18_6)', IPHONE('18_6', 'Version/26.0 Mobile/15E148 Safari/604.1'), 'iPhone', 5, apple(false)],
  ['iPhone, Chrome', IPHONE('18_5', 'CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1'), 'iPhone', 5, apple(false)],
  ['iPhone, Firefox on iOS 17.4', IPHONE('17_4', 'FxiOS/126.0 Mobile/15E148 Safari/605.1.15'), 'iPhone', 5, apple(true)],
  ['iPhone, Facebook in-app browser', IPHONE('18_5', 'Mobile/22F76 [FBAN/FBIOS;FBAV/500.0.0.0]'), 'iPhone', 5, apple(false)],
  ['iPhone, iOS 18.4.1 (three-part version)', IPHONE('18_4_1', 'Version/18.4.1 Mobile/15E148 Safari/604.1'), 'iPhone', 5, apple(false)],
  ['iPad, mobile site', 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1', 'iPad', 5, apple(true)],
  ['iPadOS 18.4 desktop mode (says Mac)', MAC_SAFARI('18.4'), 'MacIntel', 5, apple(false)],
  ['iPadOS 17.6 desktop mode (says Mac)', MAC_SAFARI('17.6'), 'MacIntel', 5, apple(true)],
  ['iPad, Chrome desktop mode (no version)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Safari/604.1', 'MacIntel', 5, apple(false)],
  ['Mac, Safari', MAC_SAFARI('26.0'), 'MacIntel', 0, google(false)],
  ['Mac, Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'MacIntel', 0, google(false)],
  ['Android, Chrome', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Linux armv81', 5, google(true)],
  ['Android, Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36', 'Linux aarch64', 5, google(true)],
  ['Android, Firefox', 'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0', 'Linux aarch64', 5, google(true)],
  ['Android, Facebook in-app browser', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]', 'Linux aarch64', 5, google(true)],
  ['Android tablet, Chrome', 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Linux aarch64', 10, google(true)],
  ['Windows, Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Win32', 0, google(false)],
  ['Windows touch laptop, Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 'Win32', 10, google(false)],
  ['Linux, Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0', 'Linux x86_64', 0, google(false)],
  ['unknown agent (empty, no platform)', '', '', 0, google(false)],
  ['ChromeOS', 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Linux x86_64', 10, google(false)],
]

describe('detectMapsDevice', () => {
  it.each(CASES)('%s', (_label, userAgent, platform, maxTouchPoints, expected) =>
    expect(detectMapsDevice({ userAgent, platform, maxTouchPoints })).toEqual(expected))
})

describe('detectMapsPlatform', () => {
  it.each(CASES)('%s', (_label, userAgent, platform, maxTouchPoints, expected) =>
    expect(detectMapsPlatform({ userAgent, platform, maxTouchPoints })).toBe(expected.platform))
})
