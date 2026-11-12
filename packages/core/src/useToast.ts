import { useCallback, useEffect, useRef, useState } from 'react'

/** One transient message at a time. A new message restarts the timer. */
export function useToast(durationMs = 3000): { toast: string | null; flash: (message: string) => void } {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const flash = useCallback(
    (message: string) => {
      window.clearTimeout(timer.current)
      setToast(message)
      timer.current = window.setTimeout(() => setToast(null), durationMs)
    },
    [durationMs],
  )
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { toast, flash }
}
