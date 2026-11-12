export type MapsPlatform = 'apple' | 'google'

export interface Destination {
  lat: number
  lng: number
  /** The street address. Directions URLs can't carry it next to coordinates (see
   *  directionsUrl), so apps use it for the link's accessible name instead. */
  label?: string
}

/** What a device opens and how: the maps app, whether its Apple Maps predates the unified
 *  URLs (iOS/iPadOS < 18.4), and whether it is a phone or tablet (where the OS hands the
 *  link to the app) rather than a desktop browser. */
export interface MapsDevice {
  platform: MapsPlatform
  legacyApple: boolean
  handheld: boolean
}

type NavigatorLike = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>

/** First version Apple documents the unified Maps URLs for ("Adopting unified Maps URLs"). */
const UNIFIED_APPLE = [18, 4] as const

const atLeast = ([major, minor]: readonly [number, number], [m, n]: readonly [number, number]) =>
  major > m || (major === m && minor >= n)

/** iPhone/iPad/iPod → Apple Maps. iPadOS asks for desktop sites and reports itself as a Mac
 *  ("Macintosh", platform MacIntel), so a "Mac" with a touch screen is an iPad: real Macs
 *  report maxTouchPoints 0. Everything else (Android, Windows, macOS, Linux) → Google Maps.
 *  The iOS version comes from "OS 17_5" in the user agent (iOS 26 Safari freezes it at
 *  18_6, still new enough), or for an iPad in desktop mode from Safari's "Version/17.5";
 *  an unknown version counts as new. */
export function detectMapsDevice(nav: NavigatorLike = navigator): MapsDevice {
  const ua = nav.userAgent
  const iosUa = /iPhone|iPad|iPod/.test(ua)
  const iPadAsMac = !iosUa && nav.platform === 'MacIntel' && nav.maxTouchPoints > 1
  if (iosUa || iPadAsMac) {
    const m = iosUa ? ua.match(/ OS (\d+)_(\d+)/) : ua.match(/Version\/(\d+)\.(\d+)/)
    const legacyApple = m ? !atLeast([Number(m[1]), Number(m[2])], UNIFIED_APPLE) : false
    return { platform: 'apple', legacyApple, handheld: true }
  }
  return { platform: 'google', legacyApple: false, handheld: /Android/i.test(ua) }
}

/** Apple Maps on iPhone/iPad, Google Maps everywhere else (plan §7 decision 12). */
export function detectMapsPlatform(nav: NavigatorLike = navigator): MapsPlatform {
  return detectMapsDevice(nav).platform
}

/** A turn-by-turn link that routes to the coordinates, which is more reliable than an
 *  address in a new subdivision. Plain https links: the OS hands them to the Maps or Google
 *  Maps app on phones, and they open the web map anywhere else (a maps:// link would fail
 *  outright without the app).
 *  - Apple, iOS 18.4+: https://maps.apple.com/directions?destination=<lat>,<lng>
 *  - Apple, older:     https://maps.apple.com/?daddr=<lat>,<lng>
 *  - Google:           https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>
 *  None of them can label a coordinate destination (Apple's `q` is a search, not a label),
 *  so `dest.label` is not part of the URL; the maps app shows the spot's street address. */
export function directionsUrl(dest: Destination, device: MapsPlatform | MapsDevice = detectMapsDevice()): string {
  const d = typeof device === 'string' ? { platform: device, legacyApple: false } : device
  const ll = `${dest.lat.toFixed(6)},${dest.lng.toFixed(6)}`
  if (d.platform === 'apple')
    return d.legacyApple ? `https://maps.apple.com/?daddr=${ll}` : `https://maps.apple.com/directions?destination=${ll}`
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`
}
