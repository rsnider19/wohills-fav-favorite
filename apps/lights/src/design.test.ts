import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REVEAL } from './lib/reveal'

// Read from disk: vitest replaces imported CSS (even ?raw) with an empty string.
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const indexCss = read('./index.css')
// The map's CSS (M5) joins the motion checks: anything animated on the map follows the same rules.
const effectsCss = read('./effects.css') + '\n' + read('./map/map.css')

// Design guardrails for the lights theme. If a token or effect changes, these fail
// before anyone has to eyeball the screenshots.

/** Every `--color-*: #rrggbb` declared in the lights @theme. */
const tokens = Object.fromEntries(
  [...indexCss.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toLowerCase()]),
)

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const over = (fg: RGB, alpha: number, bg: RGB): RGB => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as RGB
const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const t = (name: string) => hex(tokens[name])
/** The 3rd-place text color from effects.css section 16 (M8). */
const PLACE_3 = (effectsCss.match(/\[data-rank="3"\] \[data-slot="podium-place"\] \{ color: (#[0-9a-f]{6}); \}/) ?? [])[1] ?? '#000000'

// Backgrounds that are literals in effects.css (not tokens).
const SKY_ZENITH = hex('#0f1a45') // brightest point of the sky gradient, behind the hero
const SCOREBOARD = hex('#070815') // countdown timer fill
const RAIL = hex('#0b0e20') // ticker and frame rail
const BUTTON_EDGE = hex('#e89a00') // darkest stop of the gold button gradient
const PICK_TEXT = hex('#03140a') // text on the green "Your pick" button and ribbon
const PICK_EDGE = hex('#14c95c') // darkest stop of the green "Your pick" gradient

// [label, text, background, minimum]. 4.5 = WCAG AA body text; 3 = large text (≥ 24px,
// or ≥ 18.66px bold), which is what the display-font headings and the sign are.
const PAIRS: [string, RGB, RGB, number][] = [
  ['body text on the page', t('fg'), t('bg'), 4.5],
  ['body text on a card', t('fg'), t('surface'), 4.5],
  ['tagline (fg/85) on the sky zenith', over(t('fg'), 0.85, SKY_ZENITH), SKY_ZENITH, 4.5],
  ['muted text (fg/75) on the page', over(t('fg'), 0.75, t('bg')), t('bg'), 4.5],
  ['muted text (fg/75) on a card', over(t('fg'), 0.75, t('surface')), t('surface'), 4.5],
  ['countdown units (fg/75) on the scoreboard', over(t('fg'), 0.75, SCOREBOARD), SCOREBOARD, 4.5],
  ['placeholder (fg/50) in a field', over(t('fg'), 0.5, t('field')), t('field'), 4.5],
  ['gold eyebrow on the page', t('primary'), t('bg'), 4.5],
  ['gold eyebrow on the sky zenith', t('primary'), SKY_ZENITH, 4.5],
  ['gold on a card', t('primary'), t('surface'), 4.5],
  ['countdown digits on the scoreboard', t('bulb-gold'), SCOREBOARD, 4.5],
  ['ticker text on the rail', t('primary'), RAIL, 4.5],
  ['button text on gold', t('primary-fg'), t('primary'), 4.5],
  ['button text on the darkest gold', t('primary-fg'), BUTTON_EDGE, 4.5],
  ['error text on a card', t('danger'), t('surface'), 4.5],
  ['error text in the error box', t('danger'), over(t('bulb-red'), 0.12, t('surface')), 4.5],
  ['green notice on a card', t('accent'), t('surface'), 4.5],
  ['typed text in a field', t('fg'), t('field'), 4.5],
  ['note text (fg/85) on a card', over(t('fg'), 0.85, t('surface')), t('surface'), 4.5],
  ['map attribution (fg/80) on its dark plate', over(t('fg'), 0.8, over(t('bg'), 0.78, hex('#ffffff'))), over(t('bg'), 0.78, hex('#ffffff')), 4.5],
  // M6: the map. Plates sit over the map, so they are composited over white (worst case).
  ['map hint (fg) on its plate', t('fg'), over(t('bg'), 0.85, hex('#ffffff')), 4.5],
  ['sheet address (fg/75) on the sheet', over(t('fg'), 0.75, over(t('surface'), 0.97, hex('#ffffff'))), over(t('surface'), 0.97, hex('#ffffff')), 4.5],
  ['map panel text (fg/75) on a card', over(t('fg'), 0.75, t('surface')), t('surface'), 4.5],
  // M7: the vote control, the ribbons and the podium.
  ['"Your pick" text on the green bulb', PICK_TEXT, t('bulb-green'), 4.5],
  ['"Your pick" text on the darkest green', PICK_TEXT, PICK_EDGE, 4.5],
  ['"Your house" gold on its plate', t('primary'), over(t('primary'), 0.08, t('surface')), 4.5],
  ['"Voting closed" (fg/75) on a card', over(t('fg'), 0.75, t('surface')), t('surface'), 4.5],
  ['ribbon gold on its dark pill over a photo', t('primary'), over(t('bg'), 0.85, hex('#ffffff')), 4.5],
  ['podium place: 2nd (warm white) on a card', t('bulb-white'), t('surface'), 4.5],
  // M8: axe counts the red glow under "3rd place" as its background (3.9:1), so the text is
  // a lighter red (effects.css section 16; 7.4:1 here) and the glow stays bulb red. The axe
  // e2e test (a11y.e2e.ts) is the guard for the glow itself.
  ['podium place: 3rd (light red) on a card', hex(PLACE_3), t('surface'), 4.5],
  ['podium vote count (gold) on a card', t('bulb-gold'), t('surface'), 4.5],
  ['sign letter: red', t('bulb-red'), t('bg'), 3],
  ['sign letter: green', t('bulb-green'), t('bg'), 3],
  ['sign letter: gold', t('bulb-gold'), t('bg'), 3],
  ['sign letter: blue', t('bulb-blue'), t('bg'), 3],
  ['sign letter: magenta', t('bulb-magenta'), t('bg'), 3],
]

describe('lights contrast', () => {
  it('declares every token the checks use', () => {
    for (const name of ['bg', 'surface', 'field', 'fg', 'primary', 'primary-fg', 'accent', 'danger', 'bulb-red', 'bulb-green', 'bulb-gold', 'bulb-blue', 'bulb-magenta'])
      expect(tokens[name], name).toMatch(/^#[0-9a-f]{6}$/)
  })
  it.each(PAIRS)('%s', (_label, fg, bg, min) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min)
  })
})

/** `animation:` shorthands and `animation-duration`s in effects.css, as [name, seconds, steps]. */
function animations(css: string) {
  const out: { decl: string; seconds: number; steps: number | null }[] = []
  for (const m of css.matchAll(/animation:\s*([^;]+);/g)) {
    const decl = m[1].trim()
    if (decl.startsWith('none')) continue
    const seconds = Number(decl.match(/(\d*\.?\d+)s\b/)?.[1])
    const keyframes = decl.split(/\s+/)[0]
    // A step-end chase changes once per keyframe; count the keyframe stops.
    const block = css.match(new RegExp(`@keyframes ${keyframes}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
    const steps = /step-end|steps\(/.test(decl) ? (block.match(/\d+%/g)?.length ?? 1) - 1 : null
    out.push({ decl, seconds, steps })
  }
  return out
}

describe('lights motion guardrails', () => {
  const anims = animations(effectsCss)

  it('finds the effects', () => {
    expect(anims.map((a) => a.decl.split(' ')[0])).toEqual(
      expect.arrayContaining(['bulb-chase', 'twinkle', 'power-on', 'faulty-bulb', 'snowfall-near', 'warm-up', 'live-pulse', 'bulb-pulse', 'surge', 'surge-winner', 'blackout']),
    )
  })

  it('never cycles faster than once per second (≤ 1 flash/s per effect, WCAG 2.3.1 allows 3)', () => {
    for (const a of anims) expect(a.seconds, a.decl).toBeGreaterThanOrEqual(1)
  })

  it('steps chases at most 2 times per second', () => {
    for (const a of anims.filter((x) => x.steps !== null)) expect(a.steps! / a.seconds, a.decl).toBeLessThanOrEqual(2)
  })

  it('stops everything under prefers-reduced-motion and the pause switch', () => {
    const kill = /\*,\s*\*::before,\s*\*::after\s*\{\s*animation:\s*none !important;\s*transition:\s*none !important;/
    expect(effectsCss).toMatch(new RegExp(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*/.source + kill.source))
    expect(effectsCss).toMatch(/:root\[data-motion="off"\] \*,\s*:root\[data-motion="off"\] \*::before,\s*:root\[data-motion="off"\] \*::after\s*\{\s*animation: none !important;/)
  })
})

describe('the reveal (M7)', () => {
  const seconds = (name: string) => Number(effectsCss.match(new RegExp(`animation: ${name} (\\d*\\.?\\d+)s`))?.[1])
  /** The last keyframe stop at which the blackout is still fully dark ("8%, 84%"). */
  const darkUntil = Number(effectsCss.match(/@keyframes blackout \{[\s\S]*?8%, (\d+)%/)?.[1]) / 100

  it('runs as long as the app waits (REVEAL.total) and never waits for animationend', () => {
    expect(seconds('blackout') * 1000).toBe(REVEAL.total)
  })

  it('lights the places 3, 2, 1, one at a time, before the power comes back', () => {
    const { 1: first, 2: second, 3: third } = REVEAL.surge
    expect(third).toBeLessThan(second)
    expect(second).toBeLessThan(first)
    // Each place has settled before the next starts (no two surges overlap).
    expect(third + seconds('surge') * 1000).toBeLessThanOrEqual(second)
    expect(second + seconds('surge') * 1000).toBeLessThanOrEqual(first)
    // The winner has settled before the page brightens again.
    expect(first + seconds('surge-winner') * 1000).toBeLessThanOrEqual(darkUntil * REVEAL.total)
  })

  it('only dims: every keyframe ends lit, so a stopped animation shows the final state', () => {
    for (const name of ['surge', 'surge-winner']) {
      const block = effectsCss.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
      expect(block, name).toMatch(/100% \{ opacity: 1; \}/)
    }
    expect(effectsCss).toMatch(/@keyframes blackout \{[\s\S]*?100% \{ opacity: 0; \}/)
  })
})
