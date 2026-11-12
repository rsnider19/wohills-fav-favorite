import type { ContestSettings } from './types'

/** Admin-only UI preview: force the pre-vote or live look without touching the database. */
export type WindowPreview = 'prevote' | 'live' | null

export interface VotingWindow {
  opensAt: Date | null
  closesAt: Date | null
  beforeOpen: boolean
  afterClose: boolean
  votingOpen: boolean
}

/** Pure: where `now` sits relative to the settings' window. */
export function votingWindow(settings: ContestSettings, now: Date, preview: WindowPreview = null): VotingWindow {
  const opensAt = settings.voting_opens_at ? new Date(settings.voting_opens_at) : null
  const closesAt = settings.voting_closes_at ? new Date(settings.voting_closes_at) : null
  const beforeOpen = preview ? preview === 'prevote' : opensAt !== null && now < opensAt
  const afterClose = preview ? false : closesAt !== null && now >= closesAt
  const votingOpen = preview ? preview === 'live' : settings.voting_open && !beforeOpen && !afterClose
  return { opensAt, closesAt, beforeOpen, afterClose, votingOpen }
}

export function useVotingWindow(settings: ContestSettings, now: Date, preview: WindowPreview = null): VotingWindow {
  return votingWindow(settings, now, preview)
}
