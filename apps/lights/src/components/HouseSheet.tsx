import { useId, useState, type ReactNode, type Ref } from 'react'
import { GALLERY, MAP } from '../copy'
import type { House } from '../types'
import { NavigateButton } from './NavigateButton'

interface Props {
  house: House
  /** The heading takes focus when a house is picked with the keyboard. */
  headingRef: Ref<HTMLHeadingElement>
  onClose: () => void
  /** Before "Directions" (M7: the vote button, or "Your house"). With it, Directions
   *  shrinks to the round icon: two wide buttons don't fit a 390px sheet, and the vote is
   *  the primary action. */
  actions?: ReactNode
}

/** The picked house on the map: a bottom sheet over the map on phones and tablets, the
 *  right-hand panel on desktop (layout in effects.css section 14). Photo, number, name,
 *  address, directions. */
export function HouseSheet({ house, headingRef, onClose, actions }: Props) {
  const headingId = useId()
  // Keyed by house in MapView, so a new house starts with its photo shown again.
  const [photoFailed, setPhotoFailed] = useState(false)
  const title = house.title ?? house.address
  return (
    <section data-slot="house-sheet" aria-labelledby={headingId}>
      <div data-slot="sheet-photo">
        {photoFailed ? (
          <span data-slot="sheet-photo-fallback">{GALLERY.photoFallback}</span>
        ) : (
          <img src={house.photo_url} alt={GALLERY.photoAlt(house.title, house.address)} decoding="async" onError={() => setPhotoFailed(true)} />
        )}
        <span data-slot="house-number">
          No.<b>{house.entry_number}</b>
        </span>
      </div>
      <div data-slot="sheet-body">
        <h3 id={headingId} ref={headingRef} tabIndex={-1} data-slot="house-title">
          {title}
        </h3>
        {house.title && (
          <p data-slot="house-address" className="flex items-start gap-1.5 text-sm text-fg/75">
            <svg width="14" height="14" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
              />
            </svg>
            {house.address}
          </p>
        )}
        <div data-slot="sheet-actions">
          {actions}
          <NavigateButton house={house} variant={actions ? 'icon' : 'bulb'} />
        </div>
      </div>
      <button type="button" data-slot="sheet-close" aria-label={MAP.close} title={MAP.close} onClick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </section>
  )
}
