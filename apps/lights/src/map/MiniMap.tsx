import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { boxCenter, type Box, type LatLng } from '../lib/geo'
import { motionReduced, ZOOM } from './config'
import { createMap } from './createMap'

export interface MiniMapProps {
  box: Box
  /** Where to start (an entry being edited); the neighborhood overview when null. */
  initial: LatLng | null
  /** Move here (a GPS fix or a geocoded address). A new `seq` moves again, even to the same point. */
  focus: { point: LatLng; seq: number } | null
  /** Accessible name of the map canvas. */
  label: string
  /** Shown over the map when its style can't be loaded (offline, CARTO down). */
  failedText: string
  /** Called once if the style can't be loaded. */
  onFail?: () => void
  /** After every move: the pin's position (the map center) and zoom. `byUser` is true when
   *  the visitor dragged, zoomed or used the keys, false when `focus` moved the map. */
  onMove: (center: LatLng, zoom: number, byUser: boolean) => void
}

/** The pin-confirm map: a fixed pin in the middle, the map moves under it (easier on a
 *  phone than dragging a small marker). Default export, loaded with React.lazy, so
 *  MapLibre is only downloaded when someone reaches the pin step. */
export default function MiniMap({ box, initial, focus, label, failedText, onFail, onMove }: MiniMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [moving, setMoving] = useState(false)
  const [failed, setFailed] = useState(false)
  // Read the latest props from map events without re-creating the map.
  const latest = useRef({ onMove, onFail, box, initial, label })
  useEffect(() => {
    latest.current = { onMove, onFail, box, initial, label }
  })

  useEffect(() => {
    const { box, initial, label } = latest.current
    const map = createMap({
      container: container.current!,
      box,
      center: initial ?? boxCenter(box),
      zoom: initial ? ZOOM.house : ZOOM.overview,
      label,
    })
    mapRef.current = map
    // Without its style (offline, the basemap host down) the map is a blank plate: say so
    // instead of inviting them to pan nothing. Tile errors after the style loaded are
    // left alone (MapLibre retries them as the map moves).
    let styled = false
    map.once('load', () => {
      styled = true
    })
    map.on('error', () => {
      if (styled || map.isStyleLoaded()) return
      styled = true // report once
      setFailed(true)
      latest.current.onFail?.()
    })
    map.on('movestart', () => setMoving(true))
    map.on('moveend', (e: { originalEvent?: unknown }) => {
      setMoving(false)
      const c = map.getCenter()
      latest.current.onMove({ lat: c.lat, lng: c.lng }, map.getZoom(), Boolean(e.originalEvent))
    })
    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    const target = { center: [focus.point.lng, focus.point.lat] as [number, number], zoom: Math.max(map.getZoom(), ZOOM.house) }
    if (motionReduced()) map.jumpTo(target)
    else map.flyTo({ ...target, duration: 1200 })
  }, [focus])

  return (
    <div data-slot="mini-map" className="relative h-72 w-full overflow-hidden sm:h-80">
      {/* h-full, not absolute inset-0: MapLibre's CSS sets position: relative on its container. */}
      <div ref={container} className="h-full w-full" />
      {failed && (
        <p data-slot="map-fallback" role="status" className="absolute inset-0 z-[3] flex items-center justify-center bg-sunken px-6 text-center text-fg/75">
          {failedText}
        </p>
      )}
      {/* The pin: a C9 bulb whose tip marks the map center. */}
      <div data-slot="map-pin" data-moving={moving || undefined} aria-hidden="true">
        <svg width="34" height="40" viewBox="3 1 18 21.5">
          <rect x="9" y="1.5" width="6" height="5" rx="1" fill="#1f7a3e" />
          <path d="M8.5 6.5 C4 11 5.5 17 12 22.5 C18.5 17 20 11 15.5 6.5 Z" fill="#ffc21a" />
          <ellipse cx="10.4" cy="10.5" rx="1.4" ry="2.4" fill="#fff3d6" fillOpacity="0.8" />
        </svg>
      </div>
      <div data-slot="map-pin-dot" aria-hidden="true" />
    </div>
  )
}
