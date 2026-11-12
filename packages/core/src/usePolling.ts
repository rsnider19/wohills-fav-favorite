import { useCallback, useEffect, useRef, useState } from 'react'

export interface Polling<T> {
  /** Last successful result; kept when a later load returns null/undefined (e.g. a network error). */
  data: T | undefined
  /** True until the first load settles. */
  loading: boolean
  refresh: () => Promise<void>
}

/** Runs `load` right after mount and then every `intervalMs` while `enabled`. */
export function usePolling<T>(
  load: () => Promise<T | null | undefined>,
  { intervalMs = 30_000, enabled = true }: { intervalMs?: number; enabled?: boolean } = {},
): Polling<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  // Always call the latest `load` without restarting the timers on every render.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  const refresh = useCallback(async () => {
    try {
      const next = await loadRef.current()
      if (next !== null && next !== undefined) setData(next)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    // Deferred so the first state update happens outside the effect body.
    const first = setTimeout(refresh, 0)
    const interval = setInterval(refresh, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [refresh, intervalMs, enabled])
  return { data, loading, refresh }
}
