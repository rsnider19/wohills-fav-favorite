import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// MapLibre 6 runs its tile parsing in a module worker that it looks for next to its own
// file. Bundled into our chunk it wouldn't find it, so Vite ships the worker as an asset
// and we point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'

setWorkerUrl(workerUrl)
import type { Box, LatLng } from '../lib/geo'
import { padBox } from '../lib/geo'
import { MAP_STYLE_URL, PAN_PADDING_M, ZOOM } from './config'

export interface CreateMapOptions {
  container: HTMLElement
  box: Box
  center: LatLng
  zoom: number
  label: string
}

/** One dark MapLibre map, set up the same way for every map on the site (M5 pin, M6 browse):
 *  north up, no tilt or rotation, kept near the neighborhood, zoom buttons, compact
 *  attribution. */
export function createMap({ container, box, center, zoom, label }: CreateMapOptions): MapLibreMap {
  const pan = padBox(box, PAN_PADDING_M)
  const map = new MapLibreMap({
    container,
    style: MAP_STYLE_URL,
    center: [center.lng, center.lat],
    zoom,
    minZoom: ZOOM.min,
    maxZoom: ZOOM.max,
    maxBounds: [
      [pan.minLng, pan.minLat],
      [pan.maxLng, pan.maxLat],
    ],
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  map.getCanvas().setAttribute('aria-label', label)
  return map
}
