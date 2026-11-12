export interface CountdownSegment {
  value: number
  unit: 'days' | 'hours' | 'min' | 'sec'
}

/** Whole days/hours/minutes/seconds from `now` until `target`, floored at zero. */
export function countdownSegments(target: Date, now: Date): CountdownSegment[] {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  return [
    { value: Math.floor(totalSeconds / 86_400), unit: 'days' },
    { value: Math.floor(totalSeconds / 3_600) % 24, unit: 'hours' },
    { value: Math.floor(totalSeconds / 60) % 60, unit: 'min' },
    { value: totalSeconds % 60, unit: 'sec' },
  ]
}
