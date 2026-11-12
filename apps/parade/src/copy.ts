import type { PhoneAuthLabels, VoteButtonLabels } from '@wohills/ui'

// Parade wording for the shared components (their defaults are neutral).
export const AUTH_LABELS: Partial<PhoneAuthLabels> = {
  dialogLabel: 'Sign in to vote',
  phoneEyebrow: '★ One neighbor, one vote',
  phoneTitle: 'Verify to vote',
  phoneHelp: 'We text you a 6-digit code to keep it fair. Your number is only used to verify you.',
  codeEyebrow: '★ Check your texts',
  verify: 'Verify & vote',
}

export const VOTE_LABELS: Partial<VoteButtonLabels> = {
  vote: 'Vote for this float',
}

export const TICKER = 'Worthington Hills ✦ 4th of July 2026 ✦ Fan Favorite ✦ One Neighbor, One Vote ✦ '
