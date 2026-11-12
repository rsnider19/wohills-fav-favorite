/** Bulb colors, in string order. Each maps to a --color-bulb-* token. */
export const BULB_COLORS = ['red', 'green', 'gold', 'blue', 'magenta', 'white'] as const
export type BulbColor = (typeof BULB_COLORS)[number]

export interface SwagBulb {
  x: number
  y: number
  /** Degrees; bulbs hang off the wire, tilted a little with its slope. */
  angle: number
  color: BulbColor
}

export interface Swag {
  /** SVG path for the wire. */
  wire: string
  bulbs: SwagBulb[]
}

/** A string of lights draped in `swags` scallops across a `width`-wide viewBox.
 *  Each scallop is a quadratic curve from (x0, top) down to `top + sag` and back. */
export function lightString({ width = 1200, swags = 4, perSwag = 7, top = 6, sag = 50 } = {}): Swag {
  const span = width / swags
  const ctrlY = top + 2 * sag // a quadratic's midpoint sits halfway to its control point
  let wire = ''
  const bulbs: SwagBulb[] = []
  for (let s = 0; s < swags; s++) {
    const x0 = s * span
    const x1 = x0 + span
    const xm = (x0 + x1) / 2
    wire += `${s === 0 ? `M ${x0} ${top}` : ''} Q ${xm} ${ctrlY} ${x1} ${top}`
    for (let j = 0; j < perSwag; j++) {
      const t = (j + 0.5) / perSwag
      const u = 1 - t
      const x = u * u * x0 + 2 * u * t * xm + t * t * x1
      const y = u * u * top + 2 * u * t * ctrlY + t * t * top
      const dx = 2 * u * (xm - x0) + 2 * t * (x1 - xm)
      const dy = 2 * u * (ctrlY - top) + 2 * t * (top - ctrlY)
      const slope = (Math.atan2(dy, dx) * 180) / Math.PI
      bulbs.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        angle: Math.round(slope * 0.6),
        color: BULB_COLORS[(s * perSwag + j) % BULB_COLORS.length],
      })
    }
  }
  return { wire: wire.trim(), bulbs }
}
