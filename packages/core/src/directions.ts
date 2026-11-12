export type MapsPlatform = 'apple' | 'google'

export interface Destination {
  lat: number
  lng: number
  /** Shown as the pin label in Apple Maps (e.g. the street address). */
  label?: string
}

/** Apple Maps on iPhone/iPad (iPadOS reports itself as a Mac with touch), Google elsewhere. */
export function detectMapsPlatform(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator,
): MapsPlatform {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  return ios ? 'apple' : 'google'
}

/** Turn-by-turn link that routes by coordinates (more reliable than an address
 *  in a new subdivision). Opens the native maps app on phones. */
export function directionsUrl(dest: Destination, platform: MapsPlatform = detectMapsPlatform()): string {
  const ll = `${dest.lat.toFixed(6)},${dest.lng.toFixed(6)}`
  if (platform === 'apple') {
    const q = dest.label ? `&q=${encodeURIComponent(dest.label)}` : ''
    return `https://maps.apple.com/?daddr=${ll}${q}`
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`
}
