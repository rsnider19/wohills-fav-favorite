import { VIEW_TOGGLE } from '../copy'
import type { View } from '../lib/view'

interface Props {
  view: View
  onChange: (view: View) => void
  /** Start downloading the map chunk (hover or focus on "Map"). */
  onPrefetch: () => void
}

/** Lineup ⇄ map, in the gallery's title row (M4's toolbar slot). Two 44px segments; the
 *  active one is lit gold (the admin filter look, `[data-slot="segmented"]`). */
export function ViewToggle({ view, onChange, onPrefetch }: Props) {
  return (
    <div role="group" aria-label={VIEW_TOGGLE.label} data-slot="segmented" data-variant="view">
      <button
        type="button"
        aria-pressed={view === 'lineup'}
        data-state={view === 'lineup' ? 'on' : undefined}
        onClick={() => onChange('lineup')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" />
        </svg>
        {VIEW_TOGGLE.lineup}
      </button>
      <button
        type="button"
        aria-pressed={view === 'map'}
        data-state={view === 'map' ? 'on' : undefined}
        onClick={() => onChange('map')}
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
          />
        </svg>
        {VIEW_TOGGLE.map}
      </button>
    </div>
  )
}
