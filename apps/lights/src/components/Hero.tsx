import type { ReactNode } from 'react'
import { Countdown } from '@wohills/ui'
import type { ContestStatus } from '../lib/phase'
import { COUNTDOWN_LABEL, COUNTDOWN_UNITS, HERO_CTA, HERO_EYEBROW, SCOREBOARD, SR_TITLE } from '../copy'
import { LightString } from './LightString'

// "LIGHTS", one bulb color per letter. The I is the sign's faulty bulb.
const LETTERS = [
  { ch: 'L', bulb: 'red' },
  { ch: 'I', bulb: 'green', faulty: true },
  { ch: 'G', bulb: 'gold' },
  { ch: 'H', bulb: 'blue' },
  { ch: 'T', bulb: 'magenta' },
  { ch: 'S', bulb: 'red' },
] as const

interface Props {
  /** null until settings have loaded (the tagline and countdown wait for real dates). */
  status: ContestStatus | null
  tagline: string | null
  now: Date
  /** Extra calls to action before "See the houses" (M5: "Enter your house"). */
  actions?: ReactNode
  /** Five quick taps on the eyebrow open the hidden sign-in (admin, before anything opens). */
  onSecretTap: () => void
  /** Rendered under the hero row (M7: the results podium). */
  children?: ReactNode
}

export function Hero({ status, tagline, now, actions, onSecretTap, children }: Props) {
  return (
    <section data-slot="hero" className="relative">
      <LightString />
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-6 pb-14 sm:px-6 sm:pt-10 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-12 lg:pb-20">
        <div>
          <p
            data-slot="hero-eyebrow"
            className="rise neon-sm mb-4 font-display text-xs tracking-[0.22em] text-primary uppercase select-none sm:text-sm"
            onClick={onSecretTap}
          >
            {HERO_EYEBROW}
          </p>
          <h1 data-slot="hero-title" className="font-display leading-[0.92] font-normal">
            <span className="sr-only">{SR_TITLE}</span>
            <span
              data-slot="hero-title-top"
              aria-hidden="true"
              className="neon block text-[clamp(3.1rem,15.5vw,6.25rem)]"
            >
              Holiday
            </span>
            <span aria-hidden="true" className="block font-shade text-[clamp(3.9rem,19.5vw,7.5rem)]">
              {LETTERS.map((l) => (
                <span
                  key={l.ch + l.bulb}
                  data-slot="hero-title-letter"
                  data-bulb={l.bulb}
                  data-faulty={'faulty' in l || undefined}
                  className="neon inline-block"
                >
                  {l.ch}
                </span>
              ))}
            </span>
          </h1>
          {tagline && (
            <p data-slot="hero-tagline" className="rise mt-6 max-w-[34ch] text-lg leading-relaxed text-fg/85 sm:text-xl">
              {tagline}
            </p>
          )}
          <div data-slot="hero-actions" className="rise mt-8 flex flex-wrap gap-3">
            {actions}
            <a href="#houses" className="btn-bulb">
              {HERO_CTA}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        {status && (
          <div className="rise" style={{ animationDelay: '0.2s' }}>
            {status.countdown ? (
              <Countdown
                label={COUNTDOWN_LABEL[status.countdown.kind]}
                labelPrefix="★ "
                target={status.countdown.target}
                now={now}
                unitLabels={COUNTDOWN_UNITS}
              />
            ) : (
              // No window ahead (closed, results): the same scoreboard, holding a message.
              <div data-slot="scoreboard-wrap">
                <p data-slot="countdown-label">{SCOREBOARD[status.phase].label}</p>
                <p data-slot="scoreboard">{SCOREBOARD[status.phase].text}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}
