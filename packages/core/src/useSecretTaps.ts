import { useCallback, useEffect, useRef } from 'react'

/** Returns a tap handler that calls `onTrigger` after `count` taps, each within
 *  `windowMs` of the previous one. Used for the hidden admin sign-in. */
export function useSecretTaps(onTrigger: () => void, { count = 5, windowMs = 1500 } = {}): () => void {
  const taps = useRef({ count: 0, timer: 0 })
  // Latest callback without re-creating the handler (refs may only be written outside render).
  const trigger = useRef(onTrigger)
  useEffect(() => {
    trigger.current = onTrigger
  })
  useEffect(() => () => window.clearTimeout(taps.current.timer), [])
  return useCallback(() => {
    const t = taps.current
    window.clearTimeout(t.timer)
    t.count += 1
    if (t.count >= count) {
      t.count = 0
      trigger.current()
      return
    }
    t.timer = window.setTimeout(() => {
      t.count = 0
    }, windowMs)
  }, [count, windowMs])
}
