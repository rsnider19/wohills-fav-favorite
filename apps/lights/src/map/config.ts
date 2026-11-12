// Map settings shared by M5's pin map and M6's full map. No MapLibre import here: this
// file is in the main bundle; MapLibre itself only loads with the map chunk.

/** CARTO Dark Matter (vector, OpenStreetMap data). Free with attribution, no key; the
 *  style brings its own "© OpenStreetMap contributors © CARTO" attribution, which the
 *  map shows in its corner. Tests swap it for e2e/fixtures/map-style.json. */
export const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/** Zoom levels: the whole neighborhood fits at 14; at 16.5 a house's block and the
 *  neighboring street names show (OSM has few building outlines here, so closer in is
 *  mostly empty dark). Below 16 a pin is too coarse to trust. */
export const ZOOM = { overview: 14, house: 16.5, min: 12, max: 19, precise: 16 }

/** How far past the geofence the map may pan, so the pin can reach the fence's edge. */
export const PAN_PADDING_M = 1500

/** Animations follow the motion setting: reduced motion or the header's pause switch. */
export function motionReduced(): boolean {
  return (
    document.documentElement.dataset.motion === 'off' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
}
