import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { GALLERY, PODIUM, VOTE } from '../copy'
import { markRevealSeen, REVEAL, revealKey, seenReveal, type PodiumRow } from '../lib/reveal'
import { NavigateButton } from './NavigateButton'

interface Props {
  rows: PodiumRow[]
  /** get_results() hasn't answered yet. */
  loading: boolean
  /** The admin's ?preview=results before the real reveal: sample houses, no counts. */
  sample: boolean
  /** The header's twinkle switch. Off = no reveal animation, the lit podium at once. */
  motionOn: boolean
  /** For the "Your pick" / "Your house" chips. */
  uid: string | null
  pick: string | null
}

const REDUCED = '(prefers-reduced-motion: reduce)'
function subscribeReduced(onChange: () => void) {
  const mq = matchMedia(REDUCED)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const reducedNow = () => matchMedia(REDUCED).matches

/** The reveal's state for one podium. `armed`: waiting (dark) until the podium is on
 *  screen; `play`: the power surge is running; `done`: lit. */
type Mode = 'wait' | 'armed' | 'play' | 'done'

/** The top 3 after the reveal, inside the hero (M4 slot), with the "power surge": the
 *  page dims, No. 3, No. 2 and No. 1 come on with a brownout flicker, the power returns.
 *  The animation is CSS only (effects.css section 15); nothing here waits for
 *  `animationend`, so reduced motion, the pause switch, Skip or scrolling away simply
 *  show the final, lit state (every base style is the lit one, M4 D12). */
export function Podium({ rows, loading, sample, motionOn, uid, pick }: Props) {
  const headingId = useId()
  const section = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const reduced = useSyncExternalStore(subscribeReduced, reducedNow, () => false)
  const key = revealKey(rows)
  // Read once per podium: a later markRevealSeen() must not end a reveal that is playing.
  const seen = useMemo(() => !sample && seenReveal(key), [sample, key])
  const [run, setRun] = useState<{ key: string; mode: 'play' | 'done' } | null>(null)

  // No IntersectionObserver (very old browsers): never arm, or the podium would stay dark.
  const animate = motionOn && !reduced && typeof IntersectionObserver !== 'undefined'
  let mode: Mode
  if (loading || rows.length === 0) mode = 'wait'
  else if (!animate) mode = 'done'
  else if (run?.key === key) mode = run.mode
  else mode = seen ? 'done' : 'armed'

  // Armed: start once the podium's top is in the upper 60% of the screen (on a phone it
  // sits below the hero, so the surge waits for the visitor instead of playing off screen).
  // Measured against the viewport, not the podium's own height, so a tall podium on a
  // short or landscape screen still starts.
  useEffect(() => {
    const el = section.current
    if (mode !== 'armed' || !el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        if (!sample) markRevealSeen(key)
        setRun({ key, mode: 'play' })
      },
      { rootMargin: '0px 0px -40% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [mode, key, sample])

  // Playing: done after the last surge, or as soon as the podium leaves the screen (the
  // dimmed page must never linger while the visitor reads the lineup).
  useEffect(() => {
    const el = section.current
    if (mode !== 'play' || !el) return
    const finish = () => setRun({ key, mode: 'done' })
    const timer = setTimeout(finish, REVEAL.total)
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) finish()
    })
    io.observe(el)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [mode, key])

  const toggle = () => {
    if (mode === 'play') {
      setRun({ key, mode: 'done' })
      heading.current?.focus({ preventScroll: true })
    } else setRun({ key, mode: 'play' })
  }

  return (
    <section
      ref={section}
      id="winners"
      data-slot="podium"
      data-reveal={mode === 'play' || mode === 'armed' ? mode : undefined}
      data-sample={sample || undefined}
      aria-labelledby={headingId}
      aria-busy={mode === 'wait' && loading ? true : undefined}
    >
      {mode === 'play' && <div data-slot="blackout" aria-hidden="true" />}
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="neon-sm mb-2 font-display text-xs tracking-[0.2em] text-primary uppercase sm:text-sm">
              {sample ? PODIUM.sampleEyebrow : PODIUM.eyebrow}
            </p>
            <h2 id={headingId} ref={heading} tabIndex={-1} data-slot="podium-title" data-bulb="gold" className="neon font-display text-4xl text-fg sm:text-5xl">
              {PODIUM.title}
            </h2>
          </div>
          {animate && (mode === 'play' || mode === 'done') && (
            <button type="button" className="btn-ghost" data-slot="reveal-control" onClick={toggle}>
              {mode === 'play' ? PODIUM.skip : PODIUM.replay}
            </button>
          )}
        </div>
        {sample && <p data-slot="podium-sample">{PODIUM.sampleNote}</p>}

        {mode === 'wait' ? (
          <p data-slot="podium-wait" role="status">
            {loading ? PODIUM.loading : PODIUM.empty}
          </p>
        ) : (
          <ol data-slot="podium-list" data-count={rows.length}>
            {rows.map((row) => (
              <PodiumSlot key={row.id} row={row} own={uid !== null && row.house?.submitted_by === uid} pick={row.id === pick} />
            ))}
          </ol>
        )}
        {mode !== 'wait' && <p data-slot="podium-rule">{PODIUM.rule}</p>}
      </div>
    </section>
  )
}

function PodiumSlot({ row, own, pick }: { row: PodiumRow; own: boolean; pick: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const title = row.title ?? row.address
  // When this place comes on in the surge (effects.css reads it).
  const style = { '--surge-delay': `${(REVEAL.surge[row.rank] ?? 0) / 1000}s` } as CSSProperties
  return (
    <li data-slot="podium-slot" data-rank={row.rank} style={style}>
      <article data-slot="podium-card" className="bulb-frame" data-static="" data-state={row.rank === 1 ? 'lit' : undefined}>
        <div data-slot="podium-photo">
          {photoFailed ? (
            <span data-slot="house-photo-fallback">{GALLERY.photoFallback}</span>
          ) : (
            <img src={row.photoUrl} alt={GALLERY.photoAlt(row.title, row.address)} decoding="async" onError={() => setPhotoFailed(true)} />
          )}
          <span data-slot="house-number">
            No.<b>{row.entryNumber}</b>
          </span>
        </div>
        <div data-slot="podium-body">
          <p data-slot="podium-place">
            {PODIUM.place(row.rank)}
            {row.rank === 1 && <span data-slot="podium-winner">{PODIUM.winner}</span>}
          </p>
          <h3 data-slot="house-title">{title}</h3>
          {row.title && <p data-slot="house-address">{row.address}</p>}
          <p data-slot="podium-votes">
            <b>{row.votes === null ? '??' : row.votes}</b>
            <span>{PODIUM.votesUnit(row.votes)}</span>
            {row.tied && <span data-slot="podium-chip">{PODIUM.tied}</span>}
            {pick && <span data-slot="podium-chip" data-tone="pick">{VOTE.pickBadge}</span>}
            {own && <span data-slot="podium-chip" data-tone="own">{VOTE.own}</span>}
          </p>
          {row.house && (
            <div data-slot="podium-actions">
              <NavigateButton house={row.house} variant="ghost" />
            </div>
          )}
        </div>
      </article>
      <div data-slot="podium-riser" aria-hidden="true">
        {row.rank}
      </div>
    </li>
  )
}
