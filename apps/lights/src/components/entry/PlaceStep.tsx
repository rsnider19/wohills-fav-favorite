import { lazy, Suspense, useId, useRef, useState } from 'react'
import { useSupabase } from '@wohills/core'
import { ENTER } from '../../copy'
import { addressProblem, tidy } from '../../lib/entry'
import { geofence, inGeofence, roundPoint, type GeofenceSettings, type LatLng } from '../../lib/geo'
import { currentPosition, geocodeAddress, type LocateError } from '../../lib/locate'
import { ZOOM } from '../../map/config'
import { ErrorBoundary } from '../ErrorBoundary'
import { Note } from '../Page'
import type { PointSource } from './SubmitWizard'

// MapLibre (~450 KB gzip with its worker) loads only when someone reaches this step. If the
// download fails, the step works without the map (GPS or the address still set the pin); the
// browser caches a failed import(), so there is no retry short of reloading the page.
const MiniMap = lazy(() => import('../../map/MiniMap'))

interface Props {
  fence: GeofenceSettings
  address: string
  point: LatLng | null
  source: PointSource | null
  /** Where the map starts: the current pin, or the neighborhood overview when null. */
  initial: LatLng | null
  onAddress: (address: string) => void
  onPoint: (point: LatLng, source: PointSource) => void
  onBack: () => void
  onNext: () => void
}

type Busy = 'locate' | 'geocode' | null

/** Step 2: the street address (the card's text) and the pin (the map's position). The pin
 *  comes from GPS, from the address via the geocode function, or from moving the map. */
export function PlaceStep({ fence, address, point, source, initial, onAddress, onPoint, onBack, onNext }: Props) {
  const client = useSupabase()
  const addressId = useId()
  const addressRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [note, setNote] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ point: LatLng; seq: number } | null>(null)
  const [zoom, setZoom] = useState(initial ? ZOOM.house : ZOOM.overview)
  const [showAddressError, setShowAddressError] = useState(false)
  const [needPin, setNeedPin] = useState(false)
  // The map couldn't load (its chunk or its basemap): no "zoom in" or "drag" advice then.
  const [mapDown, setMapDown] = useState(false)

  const problem = addressProblem(address)
  const inside = point ? inGeofence(point, fence) : null

  function goTo(p: LatLng, from: PointSource) {
    setFocus((f) => ({ point: p, seq: (f?.seq ?? 0) + 1 }))
    onPoint(roundPoint(p), from)
    setNeedPin(false)
  }

  async function locate() {
    setBusy('locate')
    setNote(null)
    try {
      const p = await currentPosition()
      // Far away (at work, at the store): don't drag the map across town.
      if (!inGeofence(p, fence)) setNote(ENTER.locateErrors.far)
      else goTo(p, 'gps')
    } catch (err) {
      setNote(ENTER.locateErrors[(err as LocateError) in ENTER.locateErrors ? (err as LocateError) : 'unavailable'])
    } finally {
      setBusy(null)
    }
  }

  async function find() {
    if (problem) {
      setShowAddressError(true)
      addressRef.current?.focus()
      return
    }
    setBusy('geocode')
    setNote(null)
    const result = await geocodeAddress(client, tidy(address))
    setBusy(null)
    if (result.kind === 'match' && result.inGeofence) goTo(result.point, 'address')
    else if (result.kind === 'match') setNote(ENTER.geocodeErrors.outside)
    else if (result.kind === 'no-match') setNote(ENTER.geocodeErrors['no-match'])
    else setNote(ENTER.geocodeErrors[result.reason])
  }

  function next() {
    if (problem) {
      setShowAddressError(true)
      addressRef.current?.focus()
      return
    }
    if (!point || !inside) {
      setNeedPin(true)
      return
    }
    onNext()
  }

  const zoomedOut = !mapDown && zoom < ZOOM.precise
  const hint = !point
    ? ENTER.pinHint.none
    : !inside
      ? ENTER.pinHint.outside
      : zoomedOut
        ? ENTER.pinHint.zoom
        : mapDown
          ? ENTER.pinHint.insideNoMap
          : ENTER.pinHint.inside
  const hintTone = !point ? (needPin ? 'error' : 'info') : !inside ? 'error' : zoomedOut ? 'info' : 'ok'

  return (
    <div className="space-y-6">
      <h2 data-slot="step-title" tabIndex={-1}>{ENTER.placeTitle}</h2>

      <div>
        <label htmlFor={addressId} data-slot="field-label">
          {ENTER.addressLabel}
        </label>
        <input
          ref={addressRef}
          id={addressId}
          data-slot="field"
          type="text"
          autoComplete="street-address"
          enterKeyHint="search"
          placeholder={ENTER.addressPlaceholder}
          value={address}
          maxLength={200}
          aria-invalid={showAddressError && problem ? true : undefined}
          aria-describedby={`${addressId}-help`}
          onChange={(e) => {
            onAddress(e.target.value)
            setShowAddressError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              find()
            }
          }}
        />
        <p id={`${addressId}-help`} data-slot="field-help">
          {showAddressError && problem ? <span className="text-danger">{ENTER.addressProblems[problem]}</span> : ENTER.addressHelp}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" className={source === null ? 'btn-bulb' : 'btn-ghost'} disabled={busy !== null} onClick={locate}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          {busy === 'locate' ? ENTER.locating : ENTER.useLocation}
        </button>
        <button type="button" className="btn-ghost" disabled={busy !== null} onClick={find}>
          {busy === 'geocode' ? ENTER.finding : ENTER.findAddress}
        </button>
      </div>

      {note && (
        <Note tone="error" live="alert">
          {note}
        </Note>
      )}

      <div data-slot="map-frame">
        <ErrorBoundary
          onError={() => setMapDown(true)}
          fallback={
            <div data-slot="map-fallback" className="flex h-72 items-center justify-center bg-sunken px-6 text-center sm:h-80">
              <p className="text-fg/75">{ENTER.mapFailed}</p>
            </div>
          }
        >
          <Suspense
            fallback={
              <div data-slot="map-loading" className="flex h-72 items-center justify-center bg-sunken text-fg/75 sm:h-80">
                {ENTER.mapLoading}
              </div>
            }
          >
            <MiniMap
              box={geofence(fence)}
              initial={initial}
              focus={focus}
              label={ENTER.mapLabel}
              failedText={ENTER.mapFailed}
              onFail={() => setMapDown(true)}
              onMove={(center, z, byUser) => {
                setZoom(z)
                if (byUser || point) {
                  onPoint(roundPoint(center), byUser ? 'map' : (source ?? 'map'))
                  setNeedPin(false)
                }
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
      <div className="-mt-3 space-y-1">
        <Note tone={hintTone} live="polite">
          {hint}
        </Note>
        {point && (
          <p data-slot="pin-coords" data-lat={point.lat} data-lng={point.lng}>
            {ENTER.pinCoords(point.lat, point.lng)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-fg/10 pt-6">
        <button type="button" data-slot="text-button" onClick={onBack}>
          <span aria-hidden="true">←</span> {ENTER.back}
        </button>
        <button type="button" className="btn-bulb" disabled={busy !== null} onClick={next}>
          {ENTER.next} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}
