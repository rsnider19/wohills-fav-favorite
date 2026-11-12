import { useEffect, useState, type MouseEvent } from 'react'

/** The three pages. Real paths (not #hashes) so a flyer can print /enter, and the back
 *  button on a phone leaves the submission form instead of the site. Vite (dev, preview)
 *  and the Worker (`not_found_handling: single-page-application`) serve index.html for
 *  every path, so deep links work. */
export type Route = 'home' | 'enter' | 'admin'

const PATHS: Record<Route, string> = { home: '/', enter: '/enter', admin: '/admin' }

/** Pure: the route for a pathname. Unknown paths show the home page. */
export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === PATHS.enter) return 'enter'
  if (path === PATHS.admin) return 'admin'
  return 'home'
}

/** Pure: the href for a route, keeping only the query parameters that steer the whole
 *  app (?preview= for the admin's phase preview). */
export function routeHref(route: Route, search = ''): string {
  const keep = new URLSearchParams()
  const preview = new URLSearchParams(search).get('preview')
  if (preview) keep.set('preview', preview)
  const query = keep.toString()
  return PATHS[route] + (query ? `?${query}` : '')
}

const EVENT = 'lights:navigate'

/** Go to a route without reloading. */
export function navigate(route: Route, { replace = false }: { replace?: boolean } = {}) {
  const href = routeHref(route, window.location.search)
  if (replace) window.history.replaceState(null, '', href)
  else window.history.pushState(null, '', href)
  window.dispatchEvent(new Event(EVENT))
  window.scrollTo({ top: 0 })
}

/** onClick for an <a href={routeHref(...)}>: plain left clicks navigate in place;
 *  modified clicks (new tab, etc.) keep the browser's default. */
export function onRouteClick(route: Route) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(route)
  }
}

/** The current route; follows back/forward and navigate(). */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname))
  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', sync)
    window.addEventListener(EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(EVENT, sync)
    }
  }, [])
  return route
}
