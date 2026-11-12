// WCAG 2.3.1 flash probe (M4 Appendix C.3, as a helper): steps every animation on the page
// through time with the Web Animations API, screenshots each step and counts flashes.
// A transition is a swing of at least 0.1 in relative luminance with the darker side below
// 0.8; a flash is a pair of opposing transitions. Two measures:
//   - `block`: the worst 6×6 px block, flashes in any 1 s (M4's measure).
//   - `screen`: the whole screen at once. One ramp crosses the threshold in neighboring
//     blocks a frame or two apart, so same-direction transitions under 100 ms apart are one
//     event (something brightens, or darkens); a flash is a pair of opposing events.
// Pure translations (ticker, snow) are held still: they move rather than blink (2.2.2).
import type { Page } from '@playwright/test'

const DT = 50 // ms between samples (20 fps): resolves up to 10 flashes per second
const BLOCK = 6
const MOVERS = ['marquee', 'snowfall-near', 'snowfall-far']

/** Relative luminance per 6×6 block of a screenshot, decoded in a blank page of the same
 *  browser. JPEG at quality 95: several times faster than PNG at 1280×800, and its error
 *  averaged over a 6×6 block is far below the 0.1 threshold. */
async function blocks(decoder: Page, jpeg: Buffer): Promise<number[]> {
  return decoder.evaluate(
    async ({ b64, BLOCK }) => {
      const img = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      const { data, width, height } = g.getImageData(0, 0, img.width, img.height)
      // sRGB → linear, as a table (the pow per pixel is what makes a probe slow).
      const lin = Array.from({ length: 256 }, (_, i) => ((i /= 255) <= 0.04045 ? i / 12.92 : ((i + 0.055) / 1.055) ** 2.4))
      const bw = Math.floor(width / BLOCK)
      const bh = Math.floor(height / BLOCK)
      const out = new Array<number>(bw * bh).fill(0)
      for (let y = 0; y < bh * BLOCK; y++)
        for (let x = 0; x < bw * BLOCK; x++) {
          const i = (y * width + x) * 4
          out[Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK)] +=
            0.2126 * lin[data[i]] + 0.7152 * lin[data[i + 1]] + 0.0722 * lin[data[i + 2]]
        }
      return out.map((v) => v / (BLOCK * BLOCK))
    },
    { b64: jpeg.toString('base64'), BLOCK },
  )
}

/** Most pairs among `times` (sorted) that fit in any 1-second window. */
function perSecond(times: number[]): number {
  let most = 0
  for (let i = 0; i < times.length; i++) {
    let n = 0
    while (i + n < times.length && times[i + n] < times[i] + 1000) n++
    most = Math.max(most, Math.floor(n / 2))
  }
  return most
}

/** Step the page's animations from 0 to `durationMs` and measure. `only`: step just these
 *  animations and hold the rest at 0 (e.g. the reveal without the hero's ambient loops).
 *  Pause the page's own timers first (page.clock) if something would end the animations. */
export async function flashProbe(
  page: Page,
  durationMs: number,
  only: string[] | null = null,
): Promise<{ block: number; screen: number; stepped: string[] }> {
  const decoder = await page.context().newPage()
  const series: number[][] = []
  const names = new Set<string>()
  for (let t = 0; t <= durationMs; t += DT) {
    const running = await page.evaluate(
      ([t, movers, only]) => {
        const anims = document.getAnimations() as (Animation & { animationName?: string })[]
        const step = (name: string) => !movers.includes(name) && (only === null || only.includes(name))
        for (const a of anims) {
          a.pause()
          a.currentTime = step(a.animationName ?? '') ? t : 0
        }
        return anims.map((a) => a.animationName ?? '').filter(step)
      },
      [t, MOVERS, only] as const,
    )
    running.forEach((n) => n && names.add(n))
    series.push(await blocks(decoder, await page.screenshot({ type: 'jpeg', quality: 95 })))
  }
  await decoder.close()

  let block = 0
  const events: [number, number][] = []
  for (let b = 0; b < series[0].length; b++) {
    const times: number[] = []
    let ref = series[0][b]
    let dir = 0
    for (let k = 1; k < series.length; k++) {
      const L = series[k][b]
      if (dir === 1 && L > ref) ref = L
      else if (dir === -1 && L < ref) ref = L
      const up = L - ref >= 0.1
      const down = ref - L >= 0.1
      if ((up || down) && Math.min(L, ref) < 0.8) {
        dir = up ? 1 : -1
        times.push(k * DT)
        events.push([k * DT, dir])
        ref = L
      }
    }
    block = Math.max(block, perSecond(times))
  }
  const merged: number[] = []
  for (const d of [1, -1]) {
    const ts = [...new Set(events.filter(([, x]) => x === d).map(([t]) => t))].sort((a, b) => a - b)
    ts.forEach((t, i) => (i === 0 || t - ts[i - 1] > 100) && merged.push(t))
  }
  return { block, screen: perSecond(merged.sort((a, b) => a - b)), stepped: [...names].sort() }
}
