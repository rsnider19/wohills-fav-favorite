import { Marquee } from '@wohills/ui'
import { LightString } from '../components/LightString'
import { HERO_EYEBROW, TICKER } from '../copy'

const LETTERS = [
  { ch: 'L', bulb: 'red' },
  { ch: 'I', bulb: 'green' },
  { ch: 'G', bulb: 'gold' },
  { ch: 'H', bulb: 'blue' },
  { ch: 'T', bulb: 'magenta' },
  { ch: 'S', bulb: 'red' },
] as const

/** The 1200×630 share card (og:image): the hero's swag, sign and scoreboard and the ticker,
 *  lit and still. Rendered to public/og.jpg by scripts/og-image.mjs; never shipped as a page. */
export function OgCard() {
  return (
    <main data-slot="og-card" className="relative isolate h-[630px] w-[1200px] overflow-hidden">
      <div data-slot="sky" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col">
        <LightString />
        <div className="grid flex-1 grid-cols-[1.2fr_1fr] items-center gap-12 px-16 pb-4">
          <div>
            <p className="neon-sm mb-4 font-display text-lg tracking-[0.22em] text-primary uppercase">{HERO_EYEBROW}</p>
            <h1 data-slot="hero-title" className="font-display leading-[0.92] font-normal">
              <span data-slot="hero-title-top" className="neon block text-[5.4rem]">
                Holiday
              </span>
              <span className="block font-shade text-[6.5rem]">
                {LETTERS.map((l) => (
                  <span key={l.ch + l.bulb} data-slot="hero-title-letter" data-bulb={l.bulb} className="neon inline-block">
                    {l.ch}
                  </span>
                ))}
              </span>
            </h1>
          </div>
          <div data-slot="scoreboard-wrap">
            <p data-slot="countdown-label">★ Vote for the brightest house</p>
            <p data-slot="scoreboard">Dec 8–20</p>
            <p className="mt-7 text-[1.65rem] leading-snug text-fg/85">
              Enter your house Nov 28 – Dec 15.
              <br />
              One phone, one vote.
            </p>
          </div>
        </div>
        <Marquee text={TICKER} className="ticker" />
      </div>
    </main>
  )
}
