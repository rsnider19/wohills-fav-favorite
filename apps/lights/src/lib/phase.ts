import { votingWindow } from '@wohills/core'
import type { LightsSettings } from '../types'

/** Where the contest is, from the visitor's point of view. Display only: the database
 *  enforces every window with its own clock (M3). */
export type Phase = 'before' | 'submissions' | 'voting' | 'closed' | 'results'

export const PHASES: readonly Phase[] = ['before', 'submissions', 'voting', 'closed', 'results']

export const LIGHTS_SETTINGS_COLUMNS =
  'voting_open, results_visible, voting_opens_at, voting_closes_at, submissions_open, submissions_open_at, ' +
  'submissions_close_at, geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng'

/** Before the first settings load: nothing open, nothing counting down. Same dates and
 *  geofence as the M3 migration, so a slow first load never shows a wrong window. */
export const DEFAULT_LIGHTS_SETTINGS: LightsSettings = {
  voting_open: true,
  results_visible: false,
  voting_opens_at: '2026-12-08T05:00:00Z',
  voting_closes_at: '2026-12-21T05:00:00Z',
  submissions_open: true,
  submissions_open_at: '2026-11-28T05:00:00Z',
  submissions_close_at: '2026-12-16T05:00:00Z',
  geofence_min_lat: 40.1175,
  geofence_max_lat: 40.145,
  geofence_min_lng: -83.067,
  geofence_max_lng: -83.0305,
}

export type CountdownKind = 'entries-open' | 'voting-opens' | 'voting-closes'

export interface ContestStatus {
  phase: Phase
  /** Mirrors lights.submissions_are_open(): kill switch and window. */
  submissionsOpen: boolean
  /** Mirrors lights.owner_edits_allowed(): submissions open and voting not started. */
  ownerCanEdit: boolean
  votingOpen: boolean
  /** What the hero counts down to, if anything. */
  countdown: { kind: CountdownKind; target: Date } | null
}

const toDate = (iso: string | null) => (iso ? new Date(iso) : null)

/** Pure: the contest phase and countdown for `settings` at `now`. */
export function contestStatus(settings: LightsSettings, now: Date): ContestStatus {
  const vw = votingWindow(settings, now)
  const subsOpenAt = toDate(settings.submissions_open_at)
  const subsCloseAt = toDate(settings.submissions_close_at)
  const submissionsOpen =
    settings.submissions_open && (!subsOpenAt || now >= subsOpenAt) && (!subsCloseAt || now < subsCloseAt)
  const ownerCanEdit = submissionsOpen && vw.opensAt !== null && now < vw.opensAt

  let phase: Phase
  if (settings.results_visible) phase = 'results'
  else if (vw.votingOpen) phase = 'voting'
  else if (vw.beforeOpen) phase = submissionsOpen ? 'submissions' : 'before'
  // After the close, or inside the window with the kill switch off (paused).
  else phase = 'closed'

  let countdown: ContestStatus['countdown'] = null
  if (phase === 'before') {
    if (subsOpenAt && now < subsOpenAt) countdown = { kind: 'entries-open', target: subsOpenAt }
    else if (vw.opensAt) countdown = { kind: 'voting-opens', target: vw.opensAt }
  } else if (phase === 'submissions' && vw.opensAt) {
    countdown = { kind: 'voting-opens', target: vw.opensAt }
  } else if (phase === 'voting' && vw.closesAt) {
    countdown = { kind: 'voting-closes', target: vw.closesAt }
  }

  return { phase, submissionsOpen, ownerCanEdit, votingOpen: vw.votingOpen, countdown }
}

/** `a` before `b` (or equal, with `orEqual`); an open-ended bound is always in order. */
const inOrder = (a: string | null, b: string | null, orEqual = false) =>
  !a || !b || (orEqual ? Date.parse(a) <= Date.parse(b) : Date.parse(a) < Date.parse(b))

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Settings that put `anchor` squarely inside `phase`, for the ?preview= override.
 *  Offsets are odd on purpose so the countdown shows every digit position. */
export function previewSettings(phase: Phase, anchor: Date, base: LightsSettings): LightsSettings {
  const at = (ms: number) => new Date(anchor.getTime() + ms).toISOString()
  const windows: Record<Phase, [number, number, number, number]> = {
    //            submissions open, close,      voting opens,          closes
    before: [2 * DAY + 3 * HOUR, 20 * DAY, 12 * DAY, 25 * DAY],
    submissions: [-2 * DAY, 10 * DAY, 5 * DAY + 7 * HOUR + 23 * 60_000, 12 * DAY],
    voting: [-10 * DAY, 2 * DAY, -3 * DAY, 6 * DAY + 11 * HOUR + 42 * 60_000],
    closed: [-20 * DAY, -6 * DAY, -12 * DAY, -HOUR],
    results: [-20 * DAY, -6 * DAY, -12 * DAY, -HOUR],
  }
  const [subsOpen, subsClose, voteOpen, voteClose] = windows[phase]
  const synthesized: LightsSettings = {
    ...base,
    submissions_open: true,
    voting_open: true,
    results_visible: phase === 'results',
    submissions_open_at: at(subsOpen),
    submissions_close_at: at(subsClose),
    voting_opens_at: at(voteOpen),
    voting_closes_at: at(voteClose),
  }

  // Prefer the real dates from lights.settings wherever they still fit, so a preview never
  // shows a window that contradicts the decided one (e.g. "late entries through Dec 3" when
  // submissions really close Dec 15). Only the dates the real settings can't supply (a past
  // opening for "before", a voting window that has already started for "voting") stay
  // synthesized. "Fits" means the whole status at `anchor` is unchanged (phase, both open
  // flags, owner edits, countdown kind) and the windows stay in order; checking the phase
  // alone let e.g. a results preview pair a real Nov 28 opening with a synthesized earlier
  // close, or keep voting running behind the results.
  const want = contestStatus(synthesized, anchor)
  const fits = (candidate: LightsSettings) => {
    const got = contestStatus(candidate, anchor)
    return (
      inOrder(candidate.submissions_open_at, candidate.submissions_close_at) &&
      inOrder(candidate.voting_opens_at, candidate.voting_closes_at) &&
      inOrder(candidate.submissions_open_at, candidate.voting_opens_at, true) &&
      got.phase === want.phase &&
      got.submissionsOpen === want.submissionsOpen &&
      got.votingOpen === want.votingOpen &&
      got.ownerCanEdit === want.ownerCanEdit &&
      got.countdown?.kind === want.countdown?.kind
    )
  }
  const fields = ['submissions_open_at', 'submissions_close_at', 'voting_opens_at', 'voting_closes_at'] as const
  // Repeat until nothing changes: one real date can make room for another (a real voting
  // opening lets the real, later submissions opening stay in order).
  let result = synthesized
  for (let changed = true; changed; ) {
    changed = false
    for (const field of fields) {
      if (!base[field] || result[field] === base[field]) continue
      const candidate = { ...result, [field]: base[field] }
      if (fits(candidate)) {
        result = candidate
        changed = true
      }
    }
  }
  return result
}

/** `?preview=<phase>` from a query string, or null. */
export function parsePreview(search: string): Phase | null {
  const value = new URLSearchParams(search).get('preview')
  return PHASES.find((p) => p === value) ?? null
}
