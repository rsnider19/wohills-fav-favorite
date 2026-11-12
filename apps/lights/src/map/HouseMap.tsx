import { useEffect, useRef } from 'react'
import { GeolocateControl, Marker, type Map as MapLibreMap } from 'maplibre-gl'
import { MAP } from '../copy'
import { boxCenter, pointsBox, type Box } from '../lib/geo'
import { markerColor } from '../lib/view'
import type { House } from '../types'
import { motionReduced, ZOOM } from './config'
import { createMap } from './createMap'

export type LocateProblem = 'denied' | 'unavailable' | 'outside'

export interface HouseMapProps {
  /** Approved houses in the lineup's order (also the markers' tab order). */
  houses: House[]
  /** The geofence (pan limit and the fallback view). */
  box: Box
  selectedId: string | null
  /** Pixels at the bottom covered by the house sheet right now (0 on desktop). Read when a
   *  house is picked, so the map can keep its bulb in the uncovered part. */
  getInset: () => number
  /** A bulb was picked (`byKeyboard`: Enter/Space) or the map background tapped (null). */
  onSelect: (id: string | null, byKeyboard: boolean) => void
  /** The basemap style couldn't load (offline, CARTO down). */
  onFail: () => void
  onLocate: (problem: LocateProblem) => void
}

// A C9 bulb, tip at the bottom (the marker's anchor). Colors come from [data-bulb] in
// map.css: SVG presentation attributes can't read CSS variables (M4 D16).
const BULB_SVG =
  '<svg width="24" height="30" viewBox="3 1 18 21.5" aria-hidden="true" focusable="false">' +
  '<rect class="bulb-socket" x="9" y="1.5" width="6" height="5" rx="1"/>' +
  '<path class="bulb-glass" d="M8.5 6.5 C4 11 5.5 17 12 22.5 C18.5 17 20 11 15.5 6.5 Z"/>' +
  '<ellipse class="bulb-shine" cx="10.4" cy="10.5" rx="1.4" ry="2.4"/></svg>'

// Room for the 44px bulbs and the controls when the map frames the houses.
const FIT_PADDING = { top: 64, bottom: 40, left: 40, right: 64 }

/** The browse map: every approved house as a glowing bulb you can tap or tab to. Default
 *  export, loaded with React.lazy; it shares one MapLibre chunk with M5's pin map. */
export default function HouseMap({ houses, box, selectedId, getInset, onSelect, onFail, onLocate }: HouseMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>())
  // Read the latest props from map and DOM events without re-creating anything.
  const latest = useRef({ houses, box, selectedId, getInset, onSelect, onFail, onLocate })
  useEffect(() => {
    latest.current = { houses, box, selectedId, getInset, onSelect, onFail, onLocate }
  })

  // The map: created once, framed on the houses (or the picked house from ?house=).
  useEffect(() => {
    const { houses, box, selectedId } = latest.current
    const el = container.current!
    const map = createMap({ container: el, box, center: boxCenter(box), zoom: ZOOM.overview, label: MAP.canvas, attribution: 'top-left' })
    mapRef.current = map
    const picked = houses.find((h) => h.id === selectedId)
    const bounds = pointsBox(houses)
    if (picked) map.jumpTo({ center: [picked.lng, picked.lat], zoom: ZOOM.house })
    else if (bounds && houses.length > 1)
      map.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: FIT_PADDING, maxZoom: ZOOM.house, animate: false },
      )
    else if (bounds) map.jumpTo({ center: [bounds.minLng, bounds.minLat], zoom: ZOOM.house })

    // "Show where I am": asks for location only when tapped (a denial is sticky on iOS).
    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      trackUserLocation: true,
      showAccuracyCircle: false,
      fitBoundsOptions: { maxZoom: ZOOM.house },
    })
    map.addControl(geolocate, 'top-right')
    geolocate.on('error', (e: { code?: number }) => latest.current.onLocate(e.code === 1 ? 'denied' : 'unavailable'))
    geolocate.on('outofmaxbounds', () => latest.current.onLocate('outside'))

    // Same rule as the pin map: no style → say so (tile errors after load are retried).
    let styled = false
    map.once('load', () => {
      styled = true
    })
    map.on('error', () => {
      if (styled || map.isStyleLoaded()) return
      styled = true
      // The overlay covers the map: keep its bulbs and buttons out of the Tab order and
      // away from screen readers too.
      el.inert = true
      latest.current.onFail()
    })
    // A tap on the map itself (not on a bulb) closes the sheet.
    map.on('click', (e) => {
      const target = e.originalEvent.target as Element | null
      if (!target?.closest('[data-slot="map-bulb"]')) latest.current.onSelect(null, false)
    })
    // Focusing a bulb outside the view scrolls MapLibre's overflow:hidden container instead
    // of moving the map, which knocks every marker out of line. Undo that scroll.
    const unscroll = () => {
      if (el.scrollTop || el.scrollLeft) el.scrollTo(0, 0)
    }
    el.addEventListener('scroll', unscroll)
    const all = markers.current
    return () => {
      el.removeEventListener('scroll', unscroll)
      all.clear()
      mapRef.current = null
      map.remove()
    }
  }, [])

  // Markers: one <button> per house, kept in sync with the polled list.
  useEffect(() => {
    const map = mapRef.current!
    const all = markers.current
    const keep = new Set(houses.map((h) => h.id))
    for (const [id, { marker }] of all)
      if (!keep.has(id)) {
        marker.remove()
        all.delete(id)
      }
    const added = new Set<HTMLButtonElement>()
    for (const house of houses) {
      let entry = all.get(house.id)
      if (!entry) {
        const el = document.createElement('button')
        el.type = 'button'
        el.dataset.slot = 'map-bulb'
        el.dataset.house = house.id
        el.innerHTML = BULB_SVG
        el.addEventListener('click', (e) => {
          // detail is 0 for Enter/Space: move focus into the sheet then.
          const id = el.dataset.house!
          latest.current.onSelect(latest.current.selectedId === id ? null : id, e.detail === 0)
        })
        el.addEventListener('focus', () => {
          const m = mapRef.current
          const h = latest.current.houses.find((x) => x.id === el.dataset.house)
          if (!m || !h) return
          const p = m.project([h.lng, h.lat])
          const { clientWidth: w, clientHeight: hgt } = m.getContainer()
          if (p.x < 24 || p.y < 48 || p.x > w - 24 || p.y > hgt - 8) m.jumpTo({ center: [h.lng, h.lat] })
        })
        const on = house.id === latest.current.selectedId
        el.setAttribute('aria-pressed', String(on))
        el.toggleAttribute('data-selected', on)
        entry = { marker: new Marker({ element: el, anchor: 'bottom' }).setLngLat([house.lng, house.lat]).addTo(map), el }
        all.set(house.id, entry)
        added.add(el)
      }
      entry.marker.setLngLat([house.lng, house.lat])
      entry.el.dataset.bulb = markerColor(house.entry_number)
      entry.el.dataset.number = String(house.entry_number)
      entry.el.setAttribute('aria-label', MAP.marker(house.entry_number, house.title, house.address))
    }
    // Tab order = the lineup's order. New bulbs were appended; slot each one in before the
    // next house's bulb. Existing bulbs never move, so a focused bulb keeps its focus.
    let next: HTMLButtonElement | null = null
    for (let i = houses.length - 1; i >= 0; i--) {
      const el = all.get(houses[i].id)!.el
      if (added.has(el) && next) next.before(el)
      next = el
    }
  }, [houses])

  // The picked bulb: lit up, on top, and in the part of the map the sheet doesn't cover.
  useEffect(() => {
    for (const [id, { el }] of markers.current) {
      const on = id === selectedId
      el.setAttribute('aria-pressed', String(on))
      el.toggleAttribute('data-selected', on)
    }
    const map = mapRef.current
    const house = houses.find((h) => h.id === selectedId)
    if (!map || !house) return
    const inset = latest.current.getInset()
    const p = map.project([house.lng, house.lat])
    const { clientWidth: w, clientHeight: h } = map.getContainer()
    if (p.x > 48 && p.x < w - 48 && p.y > 64 && p.y < h - inset - 16) return // already in view
    map.easeTo({
      center: [house.lng, house.lat],
      // Shift the house up by half the sheet, so it lands in the middle of what's visible.
      offset: [0, -inset / 2],
      duration: motionReduced() ? 0 : 600,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- move only when the pick changes, not on every poll
  }, [selectedId])

  // h-full, not absolute inset-0: MapLibre's CSS sets position: relative on its container.
  return <div ref={container} data-slot="house-map-canvas" className="h-full w-full" />
}
