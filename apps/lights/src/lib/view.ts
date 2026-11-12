import { useCallback, useState } from 'react'

/** How the home page shows the houses: the lineup (cards) or the map. It lives in the
 *  query string (?view=map), not a path: it is a view of the same lineup, it survives a
 *  reload, and it can be shared. ?house=<entry number> is the house picked on the map
 *  (and, as in M4, the house the lineup pins first). */
export type View = 'lineup' | 'map'

/** Pure: the view in a query string. Anything but view=map is the lineup. */
export function parseView(search: string): View {
  return new URLSearchParams(search).get('view') === 'map' ? 'map' : 'lineup'
}

/** Pure: the entry number in ?house=, or null. */
export function parseHouse(search: string): number | null {
  const raw = new URLSearchParams(search).get('house')?.trim() ?? ''
  return /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null
}

/** Pure: the query string for a view and picked house. Keeps every other parameter
 *  (?preview= for the admin, ?signin); the lineup drops both `view` and `house`. */
export function viewSearch(search: string, view: View, house: number | null = null): string {
  const params = new URLSearchParams(search)
  params.delete('view')
  params.delete('house')
  if (view === 'map') {
    params.set('view', 'map')
    if (house !== null) params.set('house', String(house))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Rewrite the address bar without a history entry: toggling views and picking houses
 *  shouldn't fill the back button. The hash (#houses) is dropped. */
export function replaceSearch(search: string) {
  window.history.replaceState(window.history.state, '', window.location.pathname + search)
}

/** The current view, read once from the URL; setting it rewrites the URL. */
export function useView(): [View, (view: View) => void] {
  const [view, setViewState] = useState<View>(() => parseView(window.location.search))
  const setView = useCallback((next: View) => {
    replaceSearch(viewSearch(window.location.search, next))
    setViewState(next)
  }, [])
  return [view, setView]
}

/** Bulb color of a house's map marker. Fixed per entry number (a house keeps its color
 *  across visits and polls), rotating through the C9 palette. */
export const MARKER_COLORS = ['red', 'green', 'gold', 'blue', 'magenta', 'white'] as const
export type MarkerColor = (typeof MARKER_COLORS)[number]
export function markerColor(entryNumber: number): MarkerColor {
  const n = Math.abs(Math.trunc(entryNumber))
  return MARKER_COLORS[(n + MARKER_COLORS.length - 1) % MARKER_COLORS.length]
}
