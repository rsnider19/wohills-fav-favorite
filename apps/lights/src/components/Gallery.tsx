import type { ReactNode } from 'react'
import { useShuffledOrder } from '@wohills/core'
import type { House } from '../types'
import type { Phase } from '../lib/phase'
import { GALLERY } from '../copy'
import { HouseCard, type HouseCardProps } from './HouseCard'

// Module-level so useShuffledOrder's memo stays stable across renders.
const houseId = (h: House) => h.id
const houseNumber = (h: House) => String(h.entry_number)

interface Props {
  houses: House[] | undefined
  loading: boolean
  phase: Phase | null
  submissionsOpenAt: Date | null
  onRetry: () => void
  /** Next to the title (M6: the gallery ⇄ map toggle). */
  toolbar?: ReactNode
  /** Per-card props from later milestones (M6 navigate, M7 vote / lit / badge). */
  renderCard?: (house: House) => Pick<HouseCardProps, 'lit' | 'badge' | 'actions'>
}

/** The lineup: every approved house, shuffled per visit (?house=<number> pins one first). */
export function Gallery({ houses, loading, phase, submissionsOpenAt, onRetry, toolbar, renderCard }: Props) {
  const ordered = useShuffledOrder(houses ?? [], { getId: houseId, getPinKey: houseNumber, pinParam: 'house' })
  const failed = !loading && houses === undefined

  return (
    <section id="houses" data-slot="gallery" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 py-14 sm:px-6 sm:py-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          {houses && houses.length > 0 && (
            <p data-slot="gallery-count" className="neon-sm mb-2 font-display text-xs tracking-[0.2em] text-primary uppercase sm:text-sm">
              <span aria-hidden="true">★ </span>
              {GALLERY.count(houses.length)}
            </p>
          )}
          <h2 data-slot="gallery-title" data-bulb="green" className="neon font-display text-4xl text-fg sm:text-5xl">
            {GALLERY.title}
          </h2>
        </div>
        {toolbar}
      </div>

      {loading ? (
        <div aria-busy="true">
          <p className="sr-only" role="status">
            {GALLERY.loading}
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} data-slot="house-skeleton" data-state="loading" className="bulb-frame bg-surface">
                <div className="aspect-[4/3] bg-sunken" />
                <div className="space-y-3 px-4 pt-4 pb-5">
                  <div className="h-5 w-2/3 rounded bg-fg/10" />
                  <div className="h-4 w-1/2 rounded bg-fg/10" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center font-display text-sm tracking-[0.12em] text-fg/75 uppercase" aria-hidden="true">
            {GALLERY.loading}
          </p>
        </div>
      ) : failed ? (
        <div data-slot="gallery-error" className="bulb-frame mx-auto max-w-xl bg-surface px-6 py-10 text-center" data-state="off">
          <p className="font-display text-2xl text-fg">{GALLERY.errorTitle}</p>
          <p className="mx-auto mt-3 max-w-[40ch] text-fg/75">{GALLERY.errorBody}</p>
          <button type="button" className="btn-ghost mt-6" onClick={onRetry}>
            {GALLERY.retry}
          </button>
        </div>
      ) : ordered.length === 0 ? (
        <div data-slot="gallery-empty" className="bulb-frame mx-auto max-w-xl bg-surface px-6 py-12 text-center" data-state="off">
          <p data-bulb="red" className="neon font-display text-2xl text-fg sm:text-3xl">
            {GALLERY.emptyTitle}
          </p>
          <p className="mx-auto mt-4 max-w-[40ch] text-fg/75">{GALLERY.emptyBody(phase ?? 'before', submissionsOpenAt)}</p>
          {/* M5 puts "Enter your house" here while submissions are open. */}
        </div>
      ) : (
        <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((house, i) => (
            <li key={house.id} className="rise" style={{ animationDelay: `${Math.min(i, 8) * 0.06}s` }}>
              <HouseCard house={house} {...renderCard?.(house)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
