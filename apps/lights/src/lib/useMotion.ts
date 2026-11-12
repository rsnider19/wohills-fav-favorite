import { useCallback, useState } from 'react'

const KEY = 'lights-motion'

function stored(): 'on' | 'off' {
  try {
    return localStorage.getItem(KEY) === 'off' ? 'off' : 'on'
  } catch {
    return 'on' // storage blocked (private mode): default to twinkling
  }
}

/** Called once in main.tsx before the first render, so a visitor who paused the lights
 *  never sees the sign flicker on first. */
export function applyStoredMotion() {
  document.documentElement.dataset.motion = stored()
}

/** The header's twinkle switch (WCAG 2.2.2: a way to pause content that moves for more
 *  than 5 seconds). Sets data-motion="off" on <html>; effects.css stops every animation
 *  under it. Remembered per device. Reduced-motion visitors are static either way. */
export function useMotion(): { motionOn: boolean; toggleMotion: () => void } {
  const [motionOn, setMotionOn] = useState(() => document.documentElement.dataset.motion !== 'off')
  const toggleMotion = useCallback(() => {
    // <html data-motion> is the source of truth; side effects stay out of the state updater
    // (StrictMode runs updaters twice).
    const next = document.documentElement.dataset.motion === 'off' ? 'on' : 'off'
    document.documentElement.dataset.motion = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private mode: the switch still works for this visit.
    }
    setMotionOn(next === 'on')
  }, [])
  return { motionOn, toggleMotion }
}
