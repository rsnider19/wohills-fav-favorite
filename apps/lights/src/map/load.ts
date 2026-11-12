import { lazy } from 'react'

// The browse map, loaded only when someone opens the map view (main bundle; MapLibre is
// not). It shares one MapLibre chunk with M5's pin map: both import ./createMap.
export const HouseMap = lazy(() => import('./HouseMap'))

let prefetched = false
/** Start downloading the map early (hover or focus on the "Map" button). */
export function prefetchMap() {
  if (prefetched) return
  prefetched = true
  // A failed prefetch is retried by the real import, which reports it.
  import('./HouseMap').catch(() => {
    prefetched = false
  })
}
