import { describe, expect, it } from 'vitest'
import { hashId, shuffledOrder } from './shuffle'

const ids = ['a', 'b', 'c', 'd', 'e', 'f']
const id = (s: string) => s

describe('hashId', () => {
  it('is FNV-1a mixed with the seed (pinned values)', () => {
    expect(hashId('a', 0)).toBe(0xe40c292c)
    expect(hashId('00000000-0000-4000-8000-000000000001', 2147483647)).toBe(0x6ef31b95)
  })
})

describe('shuffledOrder', () => {
  it('is deterministic for a seed and does not mutate the input', () => {
    const input = [...ids]
    expect(shuffledOrder(input, 42, id)).toEqual(shuffledOrder(input, 42, id))
    expect(input).toEqual(ids)
  })
  it('pins the matching item to the top and keeps the rest in hash order', () => {
    const base = shuffledOrder(ids, 7, id)
    const last = base[base.length - 1]
    const pinned = shuffledOrder(ids, 7, id, (s) => s === last)
    expect(pinned[0]).toBe(last)
    expect(pinned.slice(1)).toEqual(base.slice(0, -1))
  })
  it('ignores a pin that matches nothing', () => {
    expect(shuffledOrder(ids, 7, id, () => false)).toEqual(shuffledOrder(ids, 7, id))
  })
})
