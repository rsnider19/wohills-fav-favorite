import type { Phase } from './phase'
import type { House } from '../types'

/** What one house's vote control shows this visitor (M7). Display only: RLS decides
 *  (M3 D10). Each state maps onto the shared <VoteButton> in components/Ballot.tsx. */
export type BallotState =
  /** Voting is open and nobody is signed in: "Sign in to vote". */
  | 'sign-in'
  /** Open, signed in, no counted pick yet. */
  | 'vote'
  /** Open, signed in, the pick is another house: "Switch my vote here". */
  | 'change'
  /** This house is the visitor's pick (open, closed or paused). */
  | 'pick'
  /** The visitor's own house: self-votes are blocked (plan §7 #4). */
  | 'own'
  /** Before voting opens. */
  | 'not-yet'
  /** Inside the window with the kill switch off. */
  | 'paused'
  /** After the close, waiting for the reveal. */
  | 'closed'
  /** After the reveal: no vote control at all. */
  | 'none'

export interface BallotInput {
  house: Pick<House, 'id' | 'submitted_by'>
  /** The signed-in user's id, or null. */
  uid: string | null
  /** The visitor's counted pick: their vote, but only while that house is still approved
   *  (see `countedPick`). */
  pick: string | null
  phase: Phase
  votingOpen: boolean
  votingPaused: boolean
}

/** Pure: the vote control for one house. Order matters: the reveal hides every control;
 *  your own house never offers a vote; a pick stays lit after the close. */
export function ballotState({ house, uid, pick, phase, votingOpen, votingPaused }: BallotInput): BallotState {
  if (phase === 'results') return 'none'
  if (uid !== null && house.submitted_by === uid) return 'own'
  if (pick === house.id) return 'pick'
  if (votingOpen) return uid === null ? 'sign-in' : pick === null ? 'vote' : 'change'
  if (votingPaused) return 'paused'
  return phase === 'before' || phase === 'submissions' ? 'not-yet' : 'closed'
}

/** Pure: the vote that counts. A vote for a house the admin hid is kept but not counted
 *  (M3 D11); the voter sees no pick and may vote again. `houses` undefined = not loaded
 *  yet, so nothing is known and the stored vote is trusted. */
export function countedPick(myVote: string | null, houses: Pick<House, 'id'>[] | undefined): string | null {
  if (myVote === null || houses === undefined) return myVote
  return houses.some((h) => h.id === myVote) ? myVote : null
}

/** Pure: the visitor voted for a house that is no longer on the board. */
export function pickWasHidden(myVote: string | null, houses: Pick<House, 'id'>[] | undefined): boolean {
  return myVote !== null && houses !== undefined && countedPick(myVote, houses) === null
}

/** Why a vote didn't go in, for the toast. RLS answers every refusal with the same 42501
 *  (M3 D26), so the app asks the database what changed (`facts`) before choosing the copy. */
export type VoteProblem = 'closed' | 'gone' | 'own' | 'network' | 'unknown'

export interface VoteFacts {
  /** lights.voting_is_open() right after the refusal (null if that check failed too). */
  votingOpen: boolean | null
  /** The house is still approved (null if unknown). */
  approved: boolean | null
  /** The house belongs to the voter. */
  own: boolean
}

interface ErrorLike {
  code?: unknown
  message?: unknown
}

/** Pure: a network failure (supabase-js reports a failed fetch as code '' with the
 *  TypeError's message), as opposed to an answer from the database. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  const e = (error ?? {}) as ErrorLike
  const message = typeof e.message === 'string' ? e.message : ''
  return /failed to fetch|network|load failed/i.test(message)
}

/** Pure: the vote problem, from the error and what the database says now. */
export function voteProblem(error: unknown, facts: VoteFacts | null): VoteProblem {
  if (isNetworkError(error)) return 'network'
  const e = (error ?? {}) as ErrorLike
  const rejected = e.code === '42501' || (typeof e.message === 'string' && /row-level security/i.test(e.message))
  if (!rejected || !facts) return 'unknown'
  if (facts.own) return 'own'
  if (facts.votingOpen === false) return 'closed'
  if (facts.approved === false) return 'gone'
  return 'unknown'
}
