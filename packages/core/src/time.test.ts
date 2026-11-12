import { expect, it } from 'vitest'
import { countdownSegments } from './time'

const t0 = new Date('2026-12-08T05:00:00Z')
it('splits the remaining time', () => {
  const target = new Date(t0.getTime() + ((3 * 24 + 4) * 3600 + 5 * 60 + 6) * 1000 + 999)
  expect(countdownSegments(target, t0).map((s) => s.value)).toEqual([3, 4, 5, 6])
})
it('never goes negative', () => {
  expect(countdownSegments(t0, new Date(t0.getTime() + 5000)).map((s) => s.value)).toEqual([0, 0, 0, 0])
})
