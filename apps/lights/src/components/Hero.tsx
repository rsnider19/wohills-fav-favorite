import { useEffect, useRef, type ReactNode } from 'react'
import { cn, Countdown } from '@wohills/ui'
import type { ContestStatus } from '../lib/phase'
import { COUNTDOWN_LABEL, COUNTDOWN_UNITS, HERO_CTA, HERO_CTA_WINNERS, HERO_EYEBROW, PAUSED, SCOREBOARD, SR_TITLE } from '../copy'
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
  status: ContestStatus
  /** Settings still loading: the tagline and countdown keep their space but stay hidden
   *  until the real dates arrive. */
  pending: boolean
  tagline: string
  now: Date
  /** Extra calls to action before "See the houses" (M5: "Enter your house"). */
  actions?: ReactNode
  /** Five quick taps on the eyebrow open the hidden sign-in (admin, before anything opens). */
  onSecretTap: () => void
  /** Rendered under the hero row: the results podium (M7). */
  children?: ReactNode
}

export function Hero({ status, pending, tagline, now, actions, onSecretTap, children }: Props) {
  // The swag twinkle and the countdown chase are main-thread animations (SVG opacity,
  // border-image steps): Chromium recalculates their style every frame, on screen or not.
  // Hold them while the hero is scrolled away (effects.css, [data-offscreen]).
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => {
      el.toggleAttribute('data-offscreen', !entry.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const hide = pending ? 'invisible' : undefined
  // After the reveal the call to action jumps to the podium (M7); paused voting says so.
  const winners = status.phase === 'results'
  const board = status.votingPaused ? PAUSED : SCOREBOARD[status.phase]
  return (
    <section ref={ref} data-slot="hero" className="relative">
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
          <p
            data-slot="hero-tagline"
            aria-hidden={pending || undefined}
            className={cn('rise mt-6 max-w-[34ch] text-lg leading-relaxed text-fg/85 sm:text-xl', hide)}
          >
            {tagline}
          </p>
          <div data-slot="hero-actions" className="rise mt-8 flex flex-wrap gap-3">
            {actions}
            <a href={winners ? '#winners' : '#houses'} className="btn-bulb">
              {winners ? HERO_CTA_WINNERS : HERO_CTA}
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div aria-hidden={pending || undefined} className={cn('rise', hide)} style={{ animationDelay: '0.2s' }}>
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
              <p data-slot="countdown-label">{board.label}</p>
              <p data-slot="scoreboard">{board.text}</p>
            </div>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}
