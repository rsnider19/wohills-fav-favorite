import { formatPhone } from '@wohills/core'
import type { PhoneAuthLabels } from '@wohills/ui'
import type { CountdownKind, Phase } from './lib/phase'

// Every visible string of the lights shell lives here, so later milestones (and the
// neighborhood) can tweak wording in one place. Dates are always shown in Columbus time.

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/New_York',
})

/** "Saturday, Nov 28". */
export const formatDay = (date: Date) => dayFormat.format(date)

/** Window ends are exclusive (midnight after the last day): "through Tuesday, Dec 15". */
export const formatLastDay = (end: Date) => dayFormat.format(new Date(end.getTime() - 60_000))

export const SR_TITLE = 'Worthington Hills Holiday Lights'
export const HERO_EYEBROW = 'Worthington Hills ★ 2026'

export const PHASE_BADGE: Record<Phase, string> = {
  before: 'Coming soon',
  submissions: 'Entries open',
  voting: 'Voting is live',
  closed: 'Votes are in',
  results: 'Winners are in',
}

export const PREVIEW_BADGE = (phase: Phase) => `Preview: ${PHASE_BADGE[phase]}`

export interface TaglineDates {
  submissionsOpenAt: Date | null
  submissionsCloseAt: Date | null
  votingOpensAt: Date | null
  submissionsOpen: boolean
}

export function heroTagline(phase: Phase, d: TaglineDates): string {
  switch (phase) {
    case 'before':
      return d.submissionsOpenAt
        ? `Untangle the extension cords. Entries open ${formatDay(d.submissionsOpenAt)}, then the whole neighborhood votes for the brightest house in the Hills.`
        : 'Untangle the extension cords. Entries open soon, then the whole neighborhood votes for the brightest house in the Hills.'
    case 'submissions':
      return d.votingOpensAt
        ? `Entries are open! Snap your house, drop a pin and get it on the board. Voting starts ${formatDay(d.votingOpensAt)}.`
        : 'Entries are open! Snap your house, drop a pin and get it on the board.'
    case 'voting':
      return d.submissionsOpen && d.submissionsCloseAt
        ? `Voting is live. Pick the brightest house in the Hills: one phone, one vote. Late entries are welcome through ${formatLastDay(d.submissionsCloseAt)}.`
        : 'Voting is live. Pick the brightest house in the Hills: one phone, one vote.'
    case 'closed':
      return 'Voting is closed and the votes are in. The winners light up soon, so stay tuned.'
    case 'results':
      return 'The votes are counted. Here are the brightest houses in the Hills.'
  }
}

export const COUNTDOWN_LABEL: Record<CountdownKind, string> = {
  'entries-open': 'Entries open in',
  'voting-opens': 'Voting opens in',
  'voting-closes': 'Voting closes in',
}

export const COUNTDOWN_UNITS = { days: 'Days', hours: 'Hrs', min: 'Min', sec: 'Sec' } as const

export const HERO_CTA = 'See the houses'

/** The hero scoreboard when nothing is counting down. */
export const SCOREBOARD: Record<Phase, { label: string; text: string }> = {
  before: { label: '★ Stay tuned', text: 'Coming soon' },
  submissions: { label: '★ Entries open', text: 'Get lit' },
  voting: { label: '★ Voting is live', text: 'Vote now' },
  closed: { label: '★ Voting closed', text: 'Votes are in' },
  results: { label: '★ The reveal', text: 'And the winner is…' },
}

export const TICKER = '★ Holiday Lights ★ Worthington Hills ★ Brightest house wins ★ One phone, one vote '

export const GALLERY = {
  title: 'The Lineup',
  count: (n: number) => (n === 1 ? '1 house lit up' : `${n} houses lit up`),
  loading: 'Warming up the lights…',
  errorTitle: 'The lights flickered.',
  errorBody: "We couldn't load the houses. Check your connection and try again.",
  retry: 'Try again',
  emptyTitle: "Nobody's plugged in yet.",
  emptyBody: (phase: Phase, submissionsOpenAt: Date | null) => {
    if (phase === 'before')
      return submissionsOpenAt
        ? `Entries open ${formatDay(submissionsOpenAt)}. The first approved house lights up this board.`
        : 'Entries open soon. The first approved house lights up this board.'
    if (phase === 'submissions' || phase === 'voting')
      return 'Entries are open. Houses show up here as soon as they are approved.'
    return 'No houses were entered this year.'
  },
  photoFallback: 'Photo coming soon',
  number: (n: number) => `No. ${n}`,
  /** Alt text for the house photo. */
  photoAlt: (title: string | null, address: string) =>
    title ? `${title}, the holiday lights at ${address}` : `The holiday lights at ${address}`,
}

export const FOOTER = {
  madeWith: 'Made with ❤️ and way too many extension cords in Worthington Hills',
  rule: 'One phone, one vote',
  signedInAs: (phone: string) => `Signed in as ${phone}`,
  signOut: 'Sign out',
  admin: 'Admin',
}

/** Accessible name of the header switch (aria-pressed says whether it is paused). */
export const MOTION_TOGGLE = 'Pause the twinkling'

export const TOASTS = {
  signedIn: "You're in. Welcome to the light-off!",
  signedOut: 'Signed out.',
}

export const AUTH_LABELS: Partial<PhoneAuthLabels> = {
  dialogLabel: 'Sign in with your phone',
  phoneEyebrow: '★ One phone, one house, one vote',
  phoneTitle: 'Verify your phone',
  phoneHelp:
    "We'll text you a 6-digit code to keep the contest fair. Your number is never shown on the site.",
  codeEyebrow: '★ Check your texts',
  codeTitle: 'Enter your code',
  codeHelp: (phone) => `We texted a 6-digit code to ${formatPhone(phone)}.`,
  verify: 'Verify & continue',
}
