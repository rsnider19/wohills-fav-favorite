import { countdownSegments, type CountdownSegment } from '@wohills/core'

export interface CountdownProps {
  /** e.g. "Voting opens in". Also the start of the timer's aria-label. */
  label: string
  target: Date
  now: Date
  /** Decoration rendered before the visible label only (parade: "★ "). */
  labelPrefix?: string
  unitLabels?: Partial<Record<CountdownSegment['unit'], string>>
  className?: string
}

/** Days/hours/min/sec until `target`. Digits sit in fixed-width slots
 *  (--countdown-digit-width) so the timer never shifts as numbers change. */
export function Countdown({ label, target, now, labelPrefix = '', unitLabels, className }: CountdownProps) {
  const segments = countdownSegments(target, now)
  return (
    <div data-slot="countdown" className={className}>
      <p data-slot="countdown-label" className="mb-3 text-xs font-semibold tracking-[0.25em] text-primary uppercase">
        {labelPrefix}
        {label}
      </p>
      <div
        data-slot="countdown-timer"
        className="flex divide-x divide-fg/15 rounded-card border border-fg/15 bg-surface"
        role="timer"
        aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.unit}`).join(', ')}`}
      >
        {segments.map((seg) => (
          <div key={seg.unit} data-slot="countdown-segment" className="flex-1 px-4 py-4 text-center sm:px-6 sm:py-5">
            <div data-slot="countdown-value" className="font-display text-3xl font-semibold text-fg sm:text-5xl">
              {String(seg.value)
                .padStart(2, '0')
                .split('')
                .map((digit, i) => (
                  <span key={i} data-slot="countdown-digit" className="inline-block w-(--countdown-digit-width) text-center">
                    {digit}
                  </span>
                ))}
            </div>
            <div data-slot="countdown-unit" className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-fg/45 uppercase">
              {unitLabels?.[seg.unit] ?? seg.unit}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
