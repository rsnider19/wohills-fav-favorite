import { memo, Suspense, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { MAP } from '../copy'
import type { Box } from '../lib/geo'
import { parseHouse, replaceSearch, viewSearch, type View } from '../lib/view'
import type { LocateProblem } from '../map/HouseMap'
import { HouseMap } from '../map/load'
import type { House } from '../types'
import { ErrorBoundary } from './ErrorBoundary'
import { HouseSheet } from './HouseSheet'
import { Note } from './Page'

/** Phones and tablets get the bottom sheet over the map; from 1024px it is a side panel. */
const DESKTOP = '(min-width: 1024px)'

interface Props {
  /** Approved houses only, in the lineup's (shuffled) order. */
  houses: House[]
  box: Box
  /** The visitor's own entry is waiting for approval (so it isn't on the map yet). */
  ownPending: boolean
  onView: (view: View) => void
  /** Toast for the locate button's problems. */
  onMessage: (text: string) => void
}

/** The map view of the lineup: the framed map, the picked house's sheet (phones) or panel
 *  (desktop), and the fallback when the map can't load. ?house=<n> is the picked house. */
export const MapView = memo(function MapView({ houses, box, ownPending, onView, onMessage }: Props) {
  const helpId = useId()
  const frame = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [picked, setPicked] = useState<number | null>(() => parseHouse(window.location.search))
  const [failed, setFailed] = useState(false)
  const focusSheet = useRef(false)
  // A house the admin hid while it was open simply disappears (no house, no sheet).
  const selected = houses.find((h) => h.entry_number === picked) ?? null

  const pick = useCallback((house: House | null, byKeyboard = false) => {
    setPicked(house?.entry_number ?? null)
    replaceSearch(viewSearch(window.location.search, 'map', house?.entry_number ?? null))
    focusSheet.current = byKeyboard && house !== null
  }, [])

  const onSelect = useCallback(
    (id: string | null, byKeyboard: boolean) => pick(houses.find((h) => h.id === id) ?? null, byKeyboard),
    [houses, pick],
  )

  // Picked with Enter/Space: the sheet's heading takes focus, so the next Tab reaches
  // "Directions".
  useEffect(() => {
    if (selected && focusSheet.current) heading.current?.focus({ preventScroll: true })
    focusSheet.current = false
  }, [selected])

  /** Close the sheet; focus goes back to the house's bulb if it was inside the sheet. */
  const close = useCallback(() => {
    if (!selected) return
    const hadFocus = sheet.current?.contains(document.activeElement) ?? false
    pick(null)
    if (hadFocus) frame.current?.querySelector<HTMLElement>(`[data-slot="map-bulb"][data-house="${selected.id}"]`)?.focus()
  }, [selected, pick])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selected) {
      e.preventDefault()
      close()
    }
  }

  // The part of the map the sheet covers: the sheet's height on phones, nothing on desktop.
  const getInset = useCallback(() => {
    if (matchMedia(DESKTOP).matches) return 0
    return (sheet.current?.offsetHeight ?? 0) + 16
  }, [])

  // Hold the picked bulb's pulse while the map is scrolled out of view (effects.css).
  useEffect(() => {
    const el = frame.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => el.toggleAttribute('data-offscreen', !entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const onLocate = useCallback((problem: LocateProblem) => onMessage(MAP.locate[problem]), [onMessage])
  const onFail = useCallback(() => setFailed(true), [])

  const fallback = (
    <div data-slot="map-fallback" role="status">
      <p>{MAP.failed}</p>
      <button type="button" className="btn-ghost" onClick={() => onView('lineup')}>
        {MAP.showLineup}
      </button>
    </div>
  )

  return (
    <div className="space-y-4">
      {ownPending && <Note tone="info">{MAP.pendingNote}</Note>}
      <div
        ref={frame}
        data-slot="house-map"
        data-static=""
        className="bulb-frame"
        role="region"
        aria-label={MAP.region}
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
      >
        <p id={helpId} className="sr-only">
          {MAP.help}
        </p>
        <div data-slot="house-map-area">
          <ErrorBoundary fallback={null} onError={onFail}>
            <Suspense fallback={<p data-slot="map-loading">{MAP.loading}</p>}>
              <HouseMap
                houses={houses}
                box={box}
                selectedId={selected?.id ?? null}
                getInset={getInset}
                onSelect={onSelect}
                onFail={onFail}
                onLocate={onLocate}
              />
            </Suspense>
          </ErrorBoundary>
          {failed && fallback}
          {!selected && !failed && (
            <p data-slot="map-hint" aria-hidden="true">
              {MAP.hint}
            </p>
          )}
        </div>
        {selected ? (
          <div ref={sheet} data-slot="house-sheet-slot">
            <HouseSheet key={selected.id} house={selected} headingRef={heading} onClose={close} />
          </div>
        ) : (
          <div data-slot="map-panel">
            <p className="neon-sm font-display text-xs tracking-[0.2em] text-primary uppercase">{MAP.panelEyebrow(houses.length)}</p>
            <p data-slot="map-panel-title">{MAP.panelTitle}</p>
            <p className="text-fg/75">{MAP.panelBody}</p>
          </div>
        )}
      </div>
    </div>
  )
})
