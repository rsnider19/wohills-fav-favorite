import { useMemo, useState } from 'react'
import { shuffledOrder } from './shuffle'

export interface ShuffledOrderOptions<T> {
  /** Stable id used for the hash. Pass a module-level function. */
  getId: (item: T) => string
  /** Key compared with the `?<pinParam>=` value; the match is pinned to the top.
   *  Omit to disable pinning. Pass a module-level function. */
  getPinKey?: (item: T) => string
  /** Query parameter read once at mount. Default 'f'. */
  pinParam?: string
}

/** Randomized order, re-seeded on every page load, stable across re-renders
 *  and polls, with an optional ?f=<key> override that pins one item first. */
export function useShuffledOrder<T>(items: readonly T[], options: ShuffledOrderOptions<T>): T[] {
  const { getId, getPinKey, pinParam = 'f' } = options
  // Random seed picked once per page load so each visitor sees a different order.
  const [seed] = useState(() => Math.floor(Math.random() * 0xffffffff))
  const [pin] = useState(() => new URLSearchParams(window.location.search).get(pinParam)?.trim() || null)
  return useMemo(
    () =>
      shuffledOrder(items, seed, getId, pin && getPinKey ? (item) => getPinKey(item) === pin : undefined),
    [items, seed, getId, getPinKey, pin],
  )
}
