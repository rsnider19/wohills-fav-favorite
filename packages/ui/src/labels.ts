// Copy defaults and pure helpers live outside the component files so React
// Fast Refresh keeps working (a .tsx module should export only components).

export interface PhoneAuthLabels {
  dialogLabel: string
  phoneEyebrow: string
  phoneTitle: string
  phoneHelp: string
  phonePlaceholder: string
  send: string
  sending: string
  codeEyebrow: string
  codeTitle: string
  codeHelp: (phoneE164: string) => string
  verify: string
  verifying: string
  changeNumber: string
  invalidPhone: string
  invalidCode: string
}

export const DEFAULT_PHONE_AUTH_LABELS: PhoneAuthLabels = {
  dialogLabel: 'Sign in',
  phoneEyebrow: 'Phone sign-in',
  phoneTitle: 'Verify your phone',
  phoneHelp: 'We text you a 6-digit code. Your number is only used to verify you.',
  phonePlaceholder: '(555) 555-0100',
  send: 'Text me a code',
  sending: 'Sending…',
  codeEyebrow: 'Check your texts',
  codeTitle: 'Enter your code',
  codeHelp: (phone) => `We sent a 6-digit code to ${phone}.`,
  verify: 'Verify',
  verifying: 'Verifying…',
  changeNumber: 'Use a different number',
  invalidPhone: 'Please enter a valid 10-digit US phone number.',
  invalidCode: 'The code is 6 digits.',
}

export interface VoteButtonLabels {
  vote: string
  voted: string
  signIn: string
  opensSoon: string
  closed: string
  own: string
}

export const DEFAULT_VOTE_BUTTON_LABELS: VoteButtonLabels = {
  vote: 'Vote',
  voted: 'Voted ✓',
  signIn: 'Sign in to vote',
  opensSoon: 'Voting opens soon',
  closed: 'Voting closed',
  own: 'Your entry',
}

export type VoteButtonState = 'voted' | 'own' | 'before-open' | 'closed' | 'open'

export function voteButtonState({ isMyVote, isOwn, votingOpen, beforeOpen }: {
  isMyVote: boolean
  isOwn?: boolean
  votingOpen: boolean
  beforeOpen: boolean
}): VoteButtonState {
  if (isMyVote) return 'voted'
  if (isOwn) return 'own'
  if (!votingOpen) return beforeOpen ? 'before-open' : 'closed'
  return 'open'
}
