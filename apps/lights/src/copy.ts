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
  /** Phase "closed" because the admin paused voting inside the window (M7). */
  votingPaused?: boolean
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
      return d.votingPaused
        ? 'Voting is paused for a moment. Your vote is safe; check back soon.'
        : 'Voting is closed and the votes are in. The winners light up soon, so stay tuned.'
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
/** The hero's call to action after the reveal (M7): it jumps to the podium. */
export const HERO_CTA_WINNERS = 'See the winners'

/** The hero scoreboard when nothing is counting down. */
export const SCOREBOARD: Record<Phase, { label: string; text: string }> = {
  before: { label: '★ Stay tuned', text: 'Coming soon' },
  submissions: { label: '★ Entries open', text: 'Get lit' },
  voting: { label: '★ Voting is live', text: 'Vote now' },
  closed: { label: '★ Voting closed', text: 'Votes are in' },
  results: { label: '★ The reveal', text: 'And the winner is…' },
}

/** The badge and scoreboard while the admin has paused voting (phase "closed", M7). */
export const PAUSED = { badge: 'Voting paused', label: '★ Voting paused', text: 'Back soon' }

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
  saved: 'Changes saved.',
  savedPending: 'Changes saved. Your entry is waiting for approval again.',
  withdrawn: 'Entry withdrawn.',
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

// ---------------------------------------------------------------------------------------
// M5: entering a house, "My entry" and the admin's moderation queue.
// ---------------------------------------------------------------------------------------

/** "Nov 29, 8:14 PM" in Columbus time (moderation timestamps). */
const stampFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
})
export const formatStamp = (iso: string) => stampFormat.format(new Date(iso))

export const NAV = {
  enter: 'Enter your house',
  myEntry: 'My entry',
  back: 'The lineup',
  moderation: (waiting: number) => (waiting > 0 ? `Moderation · ${waiting} waiting` : 'Moderation'),
}

export const ENTER = {
  eyebrow: '★ Enter your house',
  title: 'Get on the board',
  intro:
    'Three quick steps: snap your house, drop a pin on it, give it a name if you like. The admin checks every entry before it lights up the lineup.',
  steps: ['Snap', 'Pin', 'Send'] as const,
  /** `late`: voting has already opened while entries still are (the windows overlap), so
   *  an entry is locked the moment it is sent (M3 D5). */
  rules: (votingOpensAt: Date | null, late = false) => [
    'One house per phone. Your number is never shown.',
    'Only houses in Worthington Hills can enter.',
    late
      ? "Voting has already started, so an entry is locked as soon as it's sent: no changes or withdrawing after that."
      : votingOpensAt
        ? `You can change or withdraw your entry until voting opens ${formatDay(votingOpensAt)}.`
        : 'Once voting opens, entries are locked.',
  ],
  signInCta: 'Verify your phone to start',
  signInNotice: 'Sign in to enter your house.',
  signInToSee: 'Already entered? Sign in',
  checking: 'Checking for your entry…',
  checkFailed: "We couldn't check whether this phone already has an entry. Check your connection and try again.",
  retry: 'Try again',
  // The page when entries aren't open.
  closedTitle: {
    before: 'Not yet!',
    paused: 'Entries are paused',
    closed: 'Entries are closed',
  },
  closedBody: {
    before: (opensAt: Date | null) =>
      opensAt
        ? `Entries open ${formatDay(opensAt)}. Get the lights up and come back then.`
        : 'Entries open soon. Get the lights up and come back then.',
    paused: 'The contest admin paused new entries for a moment. Check back soon.',
    closed: 'Thanks to everyone who lit up the Hills this year.',
  },
  goVote: 'Go vote',

  // Step 1: photo.
  photoTitle: 'Snap your house',
  photoHelp: 'Best from the street, at night, lights on, the whole house in the frame.',
  takePhoto: 'Take a photo',
  choosePhoto: 'Choose a photo',
  retake: 'Use a different photo',
  keepPhoto: 'Keep this photo',
  developing: 'Developing your photo…',
  photoAlt: 'Your house photo',
  photoErrors: {
    heic: "Your phone saved this photo in a format browsers can't open (HEIC). Take a screenshot of it and choose the screenshot, or use Take a photo.",
    format: "That file isn't a photo we can use. Try a JPEG or PNG.",
    size: "That photo is too big. Try a smaller one or a screenshot.",
    other: "We couldn't open that photo. Try another one.",
  },

  // Step 2: address and pin.
  placeTitle: 'Pin your house',
  addressLabel: 'Street address',
  addressPlaceholder: '1221 Candlewood Dr',
  addressHelp: 'This is what neighbors see on your card.',
  addressProblems: {
    empty: 'Enter the street address.',
    short: 'That address looks too short.',
    long: 'Keep the address under 200 characters.',
    number: 'Start with the house number, like 1221 Candlewood Dr.',
  },
  useLocation: 'Use my location',
  locating: 'Finding you…',
  findAddress: 'Find this address',
  finding: 'Looking it up…',
  mapLabel: 'Map. Move it to put the pin on your house.',
  mapLoading: 'Loading the map…',
  mapFailed: "The map didn't load. Use your location or look up the address to set the pin; you can keep going without the map.",
  pinHint: {
    none: 'Use your location, look up the address, or move the map until the pin sits on your house.',
    inside: 'Pin is inside Worthington Hills. Drag the map to fine-tune it.',
    insideNoMap: 'Pin is inside Worthington Hills.',
    outside: "That spot is outside Worthington Hills. Only houses in the neighborhood can enter.",
    zoom: 'Zoom in to make sure the pin is on your house.',
  },
  pinCoords: (lat: number, lng: number) => `Pin: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  locateErrors: {
    denied: "Location is off for this site. Type your address and tap Find this address instead.",
    unavailable: "We couldn't get a fix on your location. Type your address instead.",
    timeout: 'Finding your location took too long. Try again, or type your address.',
    unsupported: "This browser can't share its location. Type your address instead.",
    far: "You don't seem to be in Worthington Hills right now. Type your address, or try again in front of the house.",
  },
  geocodeErrors: {
    'no-match': "We couldn't find that address. Check the house number and street, or move the map to your house.",
    outside: "That address is outside Worthington Hills. Only houses in the neighborhood can enter.",
    busy: 'Too many lookups in a row. Wait a minute, or move the map to your house.',
    unavailable: "The address lookup isn't answering right now. Move the map to your house instead.",
    'signed-out': 'Your sign-in expired. Sign in again to look up the address.',
    invalid: 'Start with the house number, like 1221 Candlewood Dr.',
    network: "You seem to be offline. Check your connection, or move the map to your house.",
  },

  // Step 3: name and send.
  detailsTitle: 'Name it & send it',
  titleLabel: 'Give it a name (optional)',
  titlePlaceholder: 'The Griswold Special',
  titleHelp: 'Shown on your card above the address. Leave it blank to show just the address.',
  titleCount: (n: number, max: number) => `${n}/${max}`,
  titleTooLong: (max: number) => `Keep the name to ${max} characters.`,
  previewLabel: 'How it will look in the lineup',
  approvalNote: 'The admin checks every entry before it goes up, usually within a day.',
  editNote: (votingOpensAt: Date | null) =>
    votingOpensAt
      ? `You can change or withdraw it until voting opens ${formatDay(votingOpensAt)}.`
      : 'You can change or withdraw it until voting opens.',
  lateNote: "Voting has already started, so once you send this entry you can't change or withdraw it.",
  reapprovalNote: 'Saving changes takes your house off the board until the admin approves it again.',
  submit: 'Light it up',
  save: 'Save changes',
  next: 'Next',
  back: 'Back',
  cancelEdit: 'Cancel',
  stage: { upload: 'Uploading your photo…', save: 'Saving your entry…' },

  // Errors from the final send (M3 D26).
  sendErrors: {
    'already-entered': 'This phone already has an entry. One house per phone.',
    'duplicate-address':
      'That address is already entered. Check the house number. If it really is your house, someone beat you to it: the admin can sort it out.',
    closed: "Entries just closed, so this one didn't go through.",
    outside: 'That pin is outside Worthington Hills. Move it onto your house and try again.',
    locked: 'Voting has started, so your entry is locked now.',
    lockedClosed: "Entries are paused or closed right now, so your entry can't be changed.",
    'photo-too-large': 'That photo is too big. Go back and choose a smaller one.',
    network: "Your entry didn't go through: the connection dropped. Check it and try again. Nothing was lost.",
    unknown: "Something went wrong and your entry didn't go through. Try again.",
  },
  seeMyEntry: 'See my entry',
  changePlace: 'Fix the address or pin',
  changePhoto: 'Choose another photo',

  // Done.
  doneEyebrow: '★ Entry received',
  doneTitle: "You're on the list!",
  doneBody: 'Your house is waiting for approval. As soon as the admin approves it, it lights up the lineup.',
  doneNext: (votingOpensAt: Date | null, late = false) => [
    'The admin checks your entry, usually within a day.',
    'It lights up in the lineup.',
    late
      ? 'Voting is already open, so neighbors can vote for it as soon as it lights up. Tell them!'
      : votingOpensAt
        ? `Voting opens ${formatDay(votingOpensAt)}. Tell the neighbors!`
        : 'Then the neighborhood votes. Tell the neighbors!',
  ],
  backToLineup: 'Back to the lineup',
}

export const MY_ENTRY = {
  eyebrow: '★ My entry',
  title: 'Your house',
  status: {
    pending: 'Waiting for approval',
    approved: 'On the board',
    hidden: 'Not shown',
  },
  body: {
    pending: 'The admin checks every entry before it goes up, usually within a day. It lights up the lineup as soon as it is approved.',
    approved: (n: number) => `You're No. ${n} in the lineup. Tell the neighbors!`,
    hidden:
      "The contest admin took this entry off the board. Editing it doesn't put it back by itself; the admin looks at hidden entries again.",
  },
  seeInLineup: 'See it in the lineup',
  seeOnMap: 'See it on the map',
  canEdit: (votingOpensAt: Date | null) =>
    votingOpensAt
      ? `You can change or withdraw your entry until voting opens ${formatDay(votingOpensAt)}.`
      : 'You can change or withdraw your entry until voting opens.',
  editApprovedNote: 'Changes take it off the board until the admin approves it again.',
  locked: {
    voting: 'Voting has started, so your entry is locked: it can no longer be changed or withdrawn.',
    closed: 'Entries are closed, so your entry is locked.',
  },
  edit: 'Edit entry',
  withdraw: 'Withdraw',
  editEyebrow: '★ Edit your entry',
  withdrawTitle: 'Withdraw your entry?',
  withdrawBody: 'This deletes your entry and its photo. You can enter again while entries are open.',
  withdrawConfirm: 'Withdraw entry',
  withdrawCancel: 'Keep it',
  withdrawing: 'Withdrawing…',
  withdrawFailed: {
    network: "Your entry wasn't withdrawn: the connection dropped. Check it and try again.",
    unknown: "Something went wrong and your entry wasn't withdrawn. Try again.",
  },
  updated: (iso: string) => `Last changed ${formatStamp(iso)}`,
}

export const ADMIN = {
  eyebrow: '★ Admin',
  title: 'Moderation',
  signInBody: 'This page is for the contest admin. Sign in with the admin phone.',
  signIn: 'Sign in',
  notAdmin: "This phone isn't the contest admin.",
  show: 'Show entries',
  tabs: { pending: 'Waiting', approved: 'On the board', hidden: 'Hidden' },
  empty: {
    pending: 'Nothing waiting. Every entry has been checked.',
    approved: 'Nothing on the board yet.',
    hidden: 'Nothing hidden.',
  },
  loading: 'Loading entries…',
  loadFailed: "The entries didn't load. Check your connection and try again.",
  checkFailed: "We couldn't check whether this phone is the admin. Check your connection and try again.",
  retry: 'Try again',
  submitted: (iso: string) => `Sent ${formatStamp(iso)}`,
  edited: (iso: string) => `changed ${formatStamp(iso)}`,
  noTitle: 'No name',
  viewMap: 'Check the pin',
  openPhoto: 'Open full photo',
  approve: 'Approve',
  hide: 'Hide',
  unhide: 'Put back',
  edit: 'Edit',
  delete: 'Delete',
  toasts: {
    approved: (n: number) => `No. ${n} is on the board.`,
    hidden: (n: number) => `No. ${n} is hidden.`,
    pending: (n: number) => `No. ${n} is back in the queue.`,
    saved: 'Saved.',
    deleted: 'Entry deleted.',
    failed: "That didn't work. Refresh and try again.",
  },
  editTitle: (n: number) => `Edit No. ${n}`,
  addressInvalid: 'The address needs 5 to 200 characters.',
  pinInvalid: 'Latitude and longitude must be numbers.',
  latLabel: 'Latitude',
  lngLabel: 'Longitude',
  replacePhoto: 'Replace photo',
  photoReady: 'New photo ready. Save to use it.',
  save: 'Save',
  cancel: 'Cancel',
  deleteTitle: (n: number) => `Delete No. ${n}?`,
  deleteBody:
    'This removes the entry, its photos and any votes for it, for good. The phone and the address can then enter again. To just take it off the board, keep it hidden.',
  deleteConfirm: 'Delete for good',
}

// ---------------------------------------------------------------------------------------
// M6: the map and the navigate button.
// ---------------------------------------------------------------------------------------

export const VIEW_TOGGLE = {
  label: 'Show the houses as',
  lineup: 'Lineup',
  map: 'Map',
}

export const NAVIGATE = {
  apple: 'Apple Maps',
  google: 'Google Maps',
  /** The sheet's visible button text; the accessible name starts with it. */
  text: 'Directions',
  label: (address: string, app: string, newTab: boolean) =>
    `Directions to ${address} (${app}${newTab ? ', opens in a new tab' : ''})`,
  title: (app: string) => `Directions in ${app}`,
}

export const MAP = {
  /** The map region and its canvas. */
  region: 'Map of the houses',
  canvas: 'Map of Worthington Hills. Use the arrow keys to move it.',
  help: 'Each bulb on the map is a button for one house. The lineup lists the same houses.',
  loading: 'Plugging in the map…',
  failed: "The map didn't load. Check your connection, or see the houses in the lineup.",
  showLineup: 'Show the lineup',
  /** A marker's accessible name. */
  marker: (n: number, title: string | null, address: string) => (title ? `No. ${n}: ${title}, ${address}` : `No. ${n}: ${address}`),
  hint: 'Tap a bulb to see the house',
  panelEyebrow: (n: number) => (n === 1 ? '★ 1 house on the map' : `★ ${n} houses on the map`),
  panelTitle: 'Pick a bulb',
  panelBody: 'Every bulb is a house in the lineup. Pick one to see it and get directions.',
  close: 'Close',
  /** The visitor's own entry isn't approved yet, so it isn't on the map. */
  pendingNote: 'Your house lights up on the map as soon as the admin approves it.',
  locate: {
    denied: 'Location is off for this site. Turn it on in your browser to see where you are.',
    unavailable: "We couldn't find your location right now.",
    outside: "You're outside Worthington Hills, so the map stays on the neighborhood.",
  },
}

// ---------------------------------------------------------------------------------------
// M7: voting and the reveal.
// ---------------------------------------------------------------------------------------

const shortDayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/New_York',
})
/** "Tue, Dec 8" (fits a vote button). */
export const formatShortDay = (date: Date) => shortDayFormat.format(date)

/** A house's name in toasts and notices: its title, else its address. */
export const houseName = (house: { title: string | null; address: string }) => house.title ?? house.address

export const VOTE = {
  /** The vote button, one label per state (lib/ballot.ts). */
  signIn: 'Sign in to vote',
  vote: 'Vote for this house',
  change: 'Switch my vote here',
  pick: '★ Your pick',
  own: 'Your house',
  notYet: (opensAt: Date | null) => (opensAt ? `Voting opens ${formatShortDay(opensAt)}` : 'Voting opens soon'),
  paused: 'Voting paused',
  closed: 'Voting closed',
  saving: 'Saving…',
  /** The ribbon on the photo of the card you voted for. */
  pickBadge: '★ Your pick',
  /** Under the sign-in dialog's title when a vote is waiting for it. */
  authNotice: (name: string) => `Your vote for ${name} goes in as soon as you verify.`,
  toasts: {
    cast: (name: string) => `Vote cast for ${name} ★`,
    changed: (name: string) => `Vote switched to ${name} ★`,
    already: (name: string) => `${name} is already your pick.`,
  },
  /** Why a vote didn't go in (lib/ballot.ts voteProblem). */
  problems: {
    closed: "Voting just closed, so your vote didn't go in.",
    paused: "Voting is paused for a moment, so your vote didn't go in. Try again soon.",
    'not-yet': "Voting hasn't opened yet, so your vote didn't go in.",
    gone: "That house was just taken off the board, so your vote didn't go in. Pick another one.",
    own: "That's your own house, so it can't get your vote. Pick another one!",
    network: "Your vote didn't go in: the connection dropped. Check it and try again.",
    unknown: "Your vote didn't go in. Refresh the page and try again.",
  },
  /** Above the lineup when the house you voted for was hidden by the admin (M3 D11). */
  hiddenPick: {
    open: "The house you voted for was taken off the board, so that vote doesn't count right now. Pick another house to make it count.",
    closed: "The house you voted for was taken off the board, so that vote isn't counted.",
  },
}

export const PODIUM = {
  eyebrow: '★ The votes are counted',
  title: 'The Winners',
  sampleEyebrow: '★ Preview: sample podium',
  /** Admin preview before the real reveal: no real counts or ranks exist yet. */
  sampleNote: 'A sample podium from the first three houses. The real results stay hidden until the reveal.',
  loading: 'Counting the votes…',
  empty: 'No votes were cast, so there are no winners this year.',
  place: (rank: number) => ['1st place', '2nd place', '3rd place'][rank - 1] ?? `${rank}th place`,
  winner: 'Winner',
  /** After the count (or "??" on the sample podium): "7 votes", "1 vote". */
  votesUnit: (n: number | null) => (n === 1 ? 'vote' : 'votes'),
  tied: 'Tied',
  rule: 'Ranked by votes. Ties go to the house that entered first.',
  skip: 'Skip',
  replay: 'Replay the reveal',
  /** The ribbon on a winner's card in the lineup after the reveal. */
  rankBadge: (rank: number) => `★ ${['1st', '2nd', '3rd'][rank - 1] ?? `${rank}th`} place`,
  /** Toast when the reveal arrives while the page is open. */
  live: 'The winners are in! ★',
}
