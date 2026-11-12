import type { ReactNode } from 'react'
import { routeHref, onRouteClick } from '../lib/route'
import { NAV } from '../copy'
import { LightString } from './LightString'

interface Props {
  eyebrow: string
  title: string
  /** Bulb color of the title's neon halo. */
  bulb?: 'red' | 'green' | 'gold'
  children: ReactNode
}

/** The frame of the /enter and /admin pages: the swag, a way back to the lineup, a neon title. */
export function Page({ eyebrow, title, bulb = 'red', children }: Props) {
  return (
    <main className="grow">
      <LightString />
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-16 sm:px-6 sm:pt-8">
        <a href={routeHref('home', window.location.search)} onClick={onRouteClick('home')} data-slot="back-link">
          <span aria-hidden="true">←</span> {NAV.back}
        </a>
        <p className="neon-sm mt-6 mb-2 font-display text-xs tracking-[0.2em] text-primary uppercase sm:text-sm">{eyebrow}</p>
        <h1 data-bulb={bulb} className="neon mb-8 font-display text-4xl leading-[1.05] text-fg sm:text-5xl">
          {title}
        </h1>
        {children}
      </div>
    </main>
  )
}

/** A static marquee panel (the frame doesn't chase while you type in it). */
export function Panel({ children, className = '', off = false }: { children: ReactNode; className?: string; off?: boolean }) {
  return (
    <section data-slot="panel" data-static="" data-state={off ? 'off' : undefined} className={`bulb-frame bg-surface px-5 py-6 sm:px-8 sm:py-8 ${className}`}>
      {children}
    </section>
  )
}

/** A one-line message with a colored bulb: ok (green), error (red), info (gold), plain. */
export function Note({ tone, children, live }: { tone: 'ok' | 'error' | 'info'; children: ReactNode; live?: 'polite' | 'alert' }) {
  return (
    <p
      data-slot="note"
      data-tone={tone}
      role={live === 'alert' ? 'alert' : undefined}
      aria-live={live === 'polite' ? 'polite' : undefined}
    >
      <span data-slot="note-dot" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
