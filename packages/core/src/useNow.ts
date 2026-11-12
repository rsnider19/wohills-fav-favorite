import { useEffect, useState } from 'react'

/** A Date that ticks every `intervalMs`. Display only: windows are enforced by the database clock. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(tick)
  }, [intervalMs])
  return now
}
