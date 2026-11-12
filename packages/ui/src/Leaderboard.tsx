import type { ReactNode } from 'react'
import { cn } from './cn'

export interface LeaderboardRow {
  id: string
  title: string
  subtitle?: string | null
  imageUrl?: string | null
  imageAlt?: string
  /** Small trailing mark after the title (parade: the float's emoji). Not rendered when undefined. */
  icon?: ReactNode
  count: number
}

export interface LeaderboardProps {
  /** Rendered in order; rank = index + 1. The SQL already limits this to the top 3. */
  rows: LeaderboardRow[]
  eyebrow?: string
  title?: string
  winnerLabel?: string
  countLabel?: string
  ariaLabel?: string
  className?: string
}

/** Ranked results with proportional bars; the first row is the winner. */
export function Leaderboard({
  rows,
  eyebrow = 'The results are in',
  title = 'Results',
  winnerLabel = 'Winner',
  countLabel = 'votes',
  ariaLabel = 'Results',
  className,
}: LeaderboardProps) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section data-slot="leaderboard" className={cn('border-b border-fg/15 bg-sunken/60', className)} aria-label={ariaLabel}>
      <div className="mx-auto w-full max-w-6xl px-5 py-14">
        <p data-slot="leaderboard-eyebrow" className="mb-3 text-xs font-semibold tracking-[0.25em] text-primary uppercase">
          {eyebrow}
        </p>
        <h2 data-slot="leaderboard-title" className="mb-10 font-display text-4xl font-semibold text-fg sm:text-5xl">
          {title}
        </h2>

        <ol className="divide-y divide-fg/10">
          {rows.map((r, i) => (
            <li key={r.id} data-slot="leaderboard-row" data-rank={i + 1} className="flex items-center gap-5 py-5">
              <span
                data-slot="leaderboard-rank"
                className={cn('w-10 shrink-0 font-display text-3xl italic', i === 0 ? 'text-primary' : 'text-fg/30')}
              >
                {i + 1}
              </span>
              {r.imageUrl && (
                <img
                  data-slot="leaderboard-image"
                  src={r.imageUrl}
                  alt={r.imageAlt ?? r.title}
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-xl border border-fg/10 object-cover"
                />
              )}
              <div className="min-w-0 grow">
                <div className="flex items-baseline gap-2">
                  <span data-slot="leaderboard-entry-title" className="truncate font-display text-xl font-semibold text-fg">
                    {r.title}
                  </span>
                  {r.icon !== undefined && <span className="shrink-0 text-lg leading-none">{r.icon}</span>}
                  {i === 0 && (
                    <span
                      data-slot="leaderboard-winner"
                      className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary-fg uppercase"
                    >
                      {winnerLabel}
                    </span>
                  )}
                </div>
                {r.subtitle && (
                  <div data-slot="leaderboard-subtitle" className="truncate text-xs font-medium tracking-[0.12em] text-fg/45 uppercase">
                    {r.subtitle}
                  </div>
                )}
                <div data-slot="leaderboard-bar" className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-fg/10">
                  <div
                    data-slot="leaderboard-bar-fill"
                    className={cn('h-full rounded-full transition-[width] duration-700', i === 0 ? 'bg-primary' : 'bg-fg/40')}
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div data-slot="leaderboard-count" className={cn('font-display text-2xl font-semibold', i === 0 ? 'text-primary' : 'text-fg')}>
                  {r.count}
                </div>
                <div className="text-[10px] font-semibold tracking-[0.2em] text-fg/40 uppercase">{countLabel}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
