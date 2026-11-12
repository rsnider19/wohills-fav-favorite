import { cn } from './cn'

export interface MarqueeProps {
  text: string
  /** Copies of `text` per half of the track; enough to overfill the widest screen. Default 4. */
  repeat?: number
  className?: string
  trackClassName?: string
}

/** Decorative endless ticker (aria-hidden). Animation lives in motion.css. */
export function Marquee({ text, repeat = 4, className, trackClassName }: MarqueeProps) {
  return (
    <div data-slot="marquee" className={cn('marquee', className)} aria-hidden="true">
      <div data-slot="marquee-track" className={cn('marquee-track', trackClassName)}>
        <span>{text.repeat(repeat)}</span>
        <span>{text.repeat(repeat)}</span>
      </div>
    </div>
  )
}
