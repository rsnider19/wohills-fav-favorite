import type { Phase } from '../lib/phase'
import { MOTION_TOGGLE, PHASE_BADGE, PREVIEW_BADGE } from '../copy'

const DOT_COLOR: Record<Phase, string> = {
  before: 'gold',
  submissions: 'green',
  voting: 'green',
  closed: 'red',
  results: 'gold',
}

interface Props {
  phase: Phase | null
  preview: boolean
  motionOn: boolean
  onToggleMotion: () => void
}

/** The top bar: where the contest is (left) and the twinkle pause switch (right).
 *  The hero's giant sign is the brand, so there is no second wordmark up here. */
export function Header({ phase, preview, motionOn, onToggleMotion }: Props) {
  return (
    <header
      data-slot="site-header"
      className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6"
    >
      <div className="min-w-0">
        {phase && (
          <span data-slot="phase-badge" data-preview={preview || undefined}>
            <span data-slot="phase-dot" data-bulb={DOT_COLOR[phase]} aria-hidden="true" />
            {preview ? PREVIEW_BADGE(phase) : PHASE_BADGE[phase]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* M5 adds "My entry" here once the visitor has one. */}
        <button
          type="button"
          data-slot="motion-toggle"
          aria-pressed={!motionOn}
          aria-label={MOTION_TOGGLE}
          title={MOTION_TOGGLE}
          onClick={onToggleMotion}
        >
          {/* A bulb: lit and twinkling, or held still. */}
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="1.5" width="6" height="5" rx="1" fill="#1f7a3e" />
            <path d="M8.5 6.5 C4 11 5.5 17 12 22.5 C18.5 17 20 11 15.5 6.5 Z" fill="var(--color-primary)" />
            {motionOn ? (
              <path d="M11 9.5 v8 M13 9.5 v8" stroke="var(--color-primary-fg)" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M10.5 9.5 L15 13.5 L10.5 17.5 Z" fill="var(--color-primary-fg)" />
            )}
          </svg>
        </button>
      </div>
    </header>
  )
}
