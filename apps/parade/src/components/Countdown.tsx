interface Props {
  label: string
  target: Date
  now: Date
}

export default function Countdown({ label, target, now }: Props) {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  const segments = [
    { value: Math.floor(totalSeconds / 86_400), unit: 'days' },
    { value: Math.floor(totalSeconds / 3_600) % 24, unit: 'hours' },
    { value: Math.floor(totalSeconds / 60) % 60, unit: 'min' },
    { value: totalSeconds % 60, unit: 'sec' },
  ]

  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-[0.25em] text-primary uppercase">
        ★ {label}
      </p>
      <div
        className="flex divide-x divide-fg/15 rounded-card border border-fg/15 bg-surface"
        role="timer"
        aria-label={`${label}: ${segments.map((s) => `${s.value} ${s.unit}`).join(', ')}`}
      >
        {segments.map((seg) => (
          <div key={seg.unit} className="flex-1 px-4 py-4 text-center sm:px-6 sm:py-5">
            {/* Google Fonts' Fraunces ships no tabular figures (tnum is a no-op),
                so each digit gets a fixed 0.68em slot — just wider than its
                widest digit, the 0.664em "0" — to keep the timer from shifting. */}
            <div className="font-display text-3xl font-semibold text-fg sm:text-5xl">
              {String(seg.value)
                .padStart(2, '0')
                .split('')
                .map((digit, i) => (
                  <span key={i} className="inline-block w-(--countdown-digit-width) text-center">
                    {digit}
                  </span>
                ))}
            </div>
            <div className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-fg/45 uppercase">
              {seg.unit}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
