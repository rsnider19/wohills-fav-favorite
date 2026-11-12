import { NAVIGATE } from '../copy'
import { directionsLink } from '../lib/navigate'
import type { House } from '../types'

interface Props {
  house: Pick<House, 'lat' | 'lng' | 'address'>
  /** `icon`: the round 48px button on gallery cards. `bulb` / `ghost`: "Directions" with the
   *  icon, in the map's house sheet (M7 turns it to `ghost` next to the vote button). */
  variant: 'icon' | 'bulb' | 'ghost'
}

/** Opens turn-by-turn directions to the house in the platform's maps app: Apple Maps on
 *  iPhone and iPad, Google Maps everywhere else (plan §7 decision 12). A plain link, so it
 *  also works with JavaScript off, long-press "copy link", and middle-click. */
export function NavigateButton({ house, variant }: Props) {
  const link = directionsLink(house)
  return (
    <a
      href={link.href}
      target={link.target}
      rel={link.rel}
      aria-label={link.label}
      title={link.title}
      data-slot="navigate"
      data-variant={variant}
      className={variant === 'bulb' ? 'btn-bulb' : 'btn-ghost'}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        {/* A road sign: a diamond with a right-turn arrow. */}
        <path d="M12 2.4 21.6 12 12 21.6 2.4 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path
          d="M9.2 15v-2.6c0-.9.7-1.6 1.6-1.6h4.6M13.4 8.6l2.2 2.2-2.2 2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {variant !== 'icon' && <span>{NAVIGATE.text}</span>}
    </a>
  )
}
