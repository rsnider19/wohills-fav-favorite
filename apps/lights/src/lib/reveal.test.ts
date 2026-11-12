import { afterEach, describe, expect, it, vi } from 'vitest'
import { markRevealSeen, podiumRows, revealKey, samplePodium, seenReveal, type LightsResult } from './reveal'
import type { House } from '../types'

const house = (n: number): House => ({
  id: `h${n}`,
  entry_number: n,
  title: n === 3 ? null : `House ${n}`,
  address: `${n}00 Candlewood Dr`,
  lat: 40.13,
  lng: -83.05,
  photo_url: `https://example.test/${n}.jpg`,
  submitted_by: `owner-${n}`,
})
const result = (n: number, votes: number, rank: number): LightsResult => ({
  house_id: `h${n}`,
  entry_number: n,
  title: house(n).title,
  address: house(n).address,
  photo_url: house(n).photo_url,
  vote_count: votes,
  rank,
})
const HOUSES = [1, 2, 3, 4, 5].map(house)

describe('podiumRows', () => {
  it('keeps the SQL ranks and counts, and finds each house for directions', () => {
    const rows = podiumRows([result(1, 7, 1), result(2, 5, 2), result(4, 4, 3)], HOUSES)
    expect(rows.map((r) => [r.rank, r.entryNumber, r.votes, r.tied])).toEqual([
      [1, 1, 7, false],
      [2, 2, 5, false],
      [3, 4, 4, false],
    ])
    expect(rows[2].house?.id).toBe('h4')
  })
  it('marks ties (the SQL already put the earlier entry first)', () => {
    const rows = podiumRows([result(1, 5, 1), result(2, 3, 2), result(5, 3, 3)], HOUSES)
    expect(rows.map((r) => r.tied)).toEqual([false, true, true])
  })
  it('sorts by rank whatever order the rows arrive in, and never shows more than 3', () => {
    const rows = podiumRows([result(4, 4, 3), result(1, 7, 1), result(2, 5, 2), result(5, 1, 4)], HOUSES)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
  })
  it('leaves off houses with no votes', () => {
    expect(podiumRows([result(1, 2, 1), result(2, 0, 2), result(3, 0, 3)], HOUSES).map((r) => r.id)).toEqual(['h1'])
    expect(podiumRows([result(1, 0, 1)], HOUSES)).toEqual([])
    expect(podiumRows([], HOUSES)).toEqual([])
  })
  it('has no house (so no directions) for a row the lineup does not have yet', () => {
    expect(podiumRows([result(9, 3, 1)], HOUSES)[0].house).toBeNull()
    expect(podiumRows([result(1, 3, 1)], undefined)[0].house).toBeNull()
  })
  it('reads bigint columns that arrive as strings', () => {
    const rows = podiumRows([{ ...result(1, 0, 1), vote_count: '12' as unknown as number, rank: '1' as unknown as number }], HOUSES)
    expect(rows[0]).toMatchObject({ votes: 12, rank: 1 })
  })
})

describe('samplePodium', () => {
  it('uses the first three houses by entry number and no counts', () => {
    const rows = samplePodium([house(5), house(2), house(4), house(1)])
    expect(rows.map((r) => [r.rank, r.entryNumber, r.votes])).toEqual([
      [1, 1, null],
      [2, 2, null],
      [3, 4, null],
    ])
  })
  it('copes with fewer than three houses', () => {
    expect(samplePodium([house(2)])).toHaveLength(1)
    expect(samplePodium([])).toEqual([])
  })
})

describe('seen reveal', () => {
  afterEach(() => vi.unstubAllGlobals())
  const rows = podiumRows([result(1, 7, 1), result(2, 5, 2)], HOUSES)

  it('remembers the podium it played, and plays a changed one again', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
    const key = revealKey(rows)
    expect(seenReveal(key)).toBe(false)
    markRevealSeen(key)
    expect(seenReveal(key)).toBe(true)
    expect(seenReveal(revealKey(rows.slice(1)))).toBe(false)
  })
  it('plays (and never throws) when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(seenReveal('x')).toBe(false)
    expect(() => markRevealSeen('x')).not.toThrow()
  })
})
