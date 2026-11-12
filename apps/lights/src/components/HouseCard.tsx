import { memo, useState, type ReactNode } from 'react'
import { cn } from '@wohills/ui'
import type { House } from '../types'
import { GALLERY } from '../copy'

export interface HouseCardProps {
  house: House
  /** "Fully lit" frame and glow: the card you voted for (M7). */
  lit?: boolean
  /** Over the photo, top right (M7: "Your pick" / "Your house" ribbon). */
  badge?: ReactNode
  /** Footer row (M6: navigate button; M7: vote button). Nothing in M4. */
  actions?: ReactNode
  className?: string
}

/** One house in the lineup: photo in a marquee bulb frame, number, name, address. */
// Memoized: the app re-renders every second for the countdown; cards don't need to.
export const HouseCard = memo(function HouseCard({ house, lit = false, badge, actions, className }: HouseCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const title = house.title ?? house.address
  return (
    <article
      data-slot="house-card"
      data-state={lit ? 'lit' : undefined}
      className={cn('bulb-frame flex h-full flex-col', className)}
    >
      <div data-slot="house-photo" className="relative aspect-[4/3] overflow-hidden bg-sunken">
        {photoFailed ? (
          <div
            data-slot="house-photo-fallback"
            className="flex h-full flex-col items-center justify-center gap-3 text-sm text-fg/75"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="1.5" width="6" height="5" rx="1" fill="#1f7a3e" />
              <path d="M8.5 6.5 C4 11 5.5 17 12 22.5 C18.5 17 20 11 15.5 6.5 Z" fill="var(--color-primary)" />
            </svg>
            {GALLERY.photoFallback}
          </div>
        ) : (
          <img
            src={house.photo_url}
            alt={GALLERY.photoAlt(house.title, house.address)}
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
        <span data-slot="house-number">
          No.<b>{house.entry_number}</b>
        </span>
        {badge && <div className="absolute top-2.5 right-2.5 z-10">{badge}</div>}
      </div>
      <div className="flex grow flex-col gap-1.5 px-4 pt-4 pb-5">
        <h3 data-slot="house-title">{title}</h3>
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
        {actions && (
          <div data-slot="house-actions" className="mt-auto flex items-center gap-3 pt-4">
            {actions}
          </div>
        )}
      </div>
    </article>
  )
})
