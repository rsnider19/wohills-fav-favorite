import { describe, expect, it } from 'vitest'
import { BULB_COLORS, lightString } from './swag'

describe('lightString', () => {
  const { wire, bulbs } = lightString()

  it('hangs 4 scallops of 7 bulbs inside the 1200×120 viewBox', () => {
    expect(bulbs).toHaveLength(28)
    expect(wire.match(/Q/g)).toHaveLength(4)
    for (const b of bulbs) {
      expect(b.x).toBeGreaterThan(0)
      expect(b.x).toBeLessThan(1200)
      // The bulb body reaches 34 units below its anchor; it must stay in the viewBox.
      expect(b.y + 34).toBeLessThanOrEqual(120)
    }
  })

  it('cycles the bulb colors in order and tilts bulbs with the wire', () => {
    expect(bulbs.slice(0, 6).map((b) => b.color)).toEqual([...BULB_COLORS])
    expect(bulbs[0].angle).toBeGreaterThan(0) // descending left half
    expect(bulbs[6].angle).toBeLessThan(0) // rising right half
  })
})
