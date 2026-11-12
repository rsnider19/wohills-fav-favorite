import { detectMapsDevice, directionsUrl, type MapsDevice } from '@wohills/core'
import { NAVIGATE } from '../copy'
import type { House } from '../types'

export interface DirectionsLink {
  href: string
  /** "_blank" on desktop (keep the contest open in its tab); none on phones and tablets,
   *  where the OS hands the link to the maps app and the page stays put. */
  target: '_blank' | undefined
  rel: 'noopener noreferrer' | undefined
  /** Accessible name: "Directions to 1221 Candlewood Dr (Google Maps, new tab)". */
  label: string
  /** Tooltip: "Directions in Google Maps". */
  title: string
}

let device: MapsDevice | null = null
/** Detected once per page load (the user agent doesn't change). */
function currentDevice(): MapsDevice {
  device ??= detectMapsDevice()
  return device
}

/** Pure given `d`: the navigate link for a house. Routes to its coordinates; the address
 *  names the link (plan §7 decision 12). */
export function directionsLink(house: Pick<House, 'lat' | 'lng' | 'address'>, d: MapsDevice = currentDevice()): DirectionsLink {
  const app = d.platform === 'apple' ? NAVIGATE.apple : NAVIGATE.google
  const newTab = !d.handheld
  return {
    href: directionsUrl({ lat: house.lat, lng: house.lng, label: house.address }, d),
    target: newTab ? '_blank' : undefined,
    rel: newTab ? 'noopener noreferrer' : undefined,
    label: NAVIGATE.label(house.address, app, newTab),
    title: NAVIGATE.title(app),
  }
}
