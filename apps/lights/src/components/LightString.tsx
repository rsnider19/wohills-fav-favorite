import { memo, type CSSProperties } from 'react'
import { BULB_COLORS, lightString } from '../lib/swag'

// Computed once at module load: the string never changes shape.
const SWAG = lightString()

/** The hero's draped string of C9 bulbs. Decorative (aria-hidden). It fills the width
 *  and crops at the sides on narrow screens (xMidYMin slice), so bulbs stay big on phones.
 *  Colors come from [data-bulb] rules and the twinkle from .swag-bulb, both in effects.css
 *  (SVG presentation attributes can't read CSS variables, so nothing color-related is inline). */
export const LightString = memo(function LightString() {
  return (
    <svg
      data-slot="light-string"
      className="light-string"
      viewBox="0 0 1200 120"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {BULB_COLORS.map((c) => (
          <radialGradient key={c} id={`halo-${c}`} data-bulb={c}>
            <stop offset="0" className="swag-halo-core" />
            <stop offset="1" className="swag-halo-edge" />
          </radialGradient>
        ))}
      </defs>
      <path d={SWAG.wire} className="swag-wire" />
      {SWAG.bulbs.map((b, i) => (
        <g
          key={i}
          className="swag-bulb"
          data-bulb={b.color}
          transform={`translate(${b.x} ${b.y}) rotate(${b.angle})`}
          style={{ '--i': i } as CSSProperties}
        >
          <circle cx="0" cy="20" r="26" fill={`url(#halo-${b.color})`} />
          <rect x="-4.5" y="-2" width="9" height="9" rx="1.5" className="swag-socket" />
          <path d="M -5 6 C -12 13, -10 25, 0 34 C 10 25, 12 13, 5 6 Z" className="swag-glass" />
          <ellipse cx="-3" cy="16" rx="1.8" ry="5" className="swag-shine" />
        </g>
      ))}
    </svg>
  )
})
