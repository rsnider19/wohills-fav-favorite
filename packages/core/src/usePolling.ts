import { useCallback, useEffect, useRef, useState } from 'react'

export interface Polling<T> {
  /** Last successful result; kept when a later load returns null/undefined (e.g. a network error). */
  data: T | undefined
  /** True while enabled and the first load hasn't settled yet. */
  loading: boolean
  refresh: () => Promise<void>
}

/** Runs `load` right after mount and then every `intervalMs` while `enabled`.
 *  Hidden tabs skip their ticks and refresh as soon as they're visible again,
 *  so a phone left on the page catches up (e.g. with a reveal) on return. */
export function usePolling<T>(
  load: () => Promise<T | null | undefined>,
  { intervalMs = 30_000, enabled = true }: { intervalMs?: number; enabled?: boolean } = {},
): Polling<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [settled, setSettled] = useState(false)
  // Always call the latest `load` without restarting the timers on every render.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  // Only the most recently started load may write: a slow poll that started
  // before a manual refresh (e.g. after an admin edit) must not overwrite it.
  const latest = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++latest.current
    try {
      const next = await loadRef.current()
      if (id === latest.current && next !== null && next !== undefined) setData(next)
    } catch (err) {
      console.error(err)
    } finally {
      setSettled(true)
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    const refreshIfVisible = () => {
      if (!document.hidden) refresh()
    }
    // Deferred so the first state update happens outside the effect body.
    const first = setTimeout(refresh, 0)
    const interval = setInterval(refreshIfVisible, intervalMs)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [refresh, intervalMs, enabled])
  return { data, loading: enabled && !settled, refresh }
}
