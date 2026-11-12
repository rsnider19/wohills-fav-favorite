import { memo } from 'react'
import { VoteButton } from '@wohills/ui'
import type { BallotState } from '../lib/ballot'
import { VOTE } from '../copy'
import type { House } from '../types'

interface Props {
  house: House
  state: BallotState
  /** Voting is open right now (a pick can be clicked again; everything else is disabled). */
  votingOpen: boolean
  /** A vote is being saved: every button waits, the one being saved says so. */
  saving: 'this' | 'other' | null
  /** voting_opens_at (ISO), for "Voting opens Tue, Dec 8". A string, so memo holds. */
  opensAt: string | null
  onVote: (house: House) => void
}

/** One house's vote control: the shared <VoteButton> with the lights labels for each
 *  state of lib/ballot.ts. `data-ballot` carries the state the shared button can't tell
 *  apart (vote / change / sign-in are all its "open"), for effects.css section 15. */
export const Ballot = memo(function Ballot({ house, state, votingOpen, saving, opensAt, onVote }: Props) {
  if (state === 'none') return null
  const open = state === 'sign-in' || state === 'vote' || state === 'change'
  return (
    <span data-slot="ballot" data-ballot={state}>
      <VoteButton
        isMyVote={state === 'pick'}
        isOwn={state === 'own'}
        votingOpen={open || (state === 'pick' && votingOpen)}
        beforeOpen={state === 'not-yet'}
        signedIn={state !== 'sign-in'}
        busy={saving !== null}
        onVote={() => onVote(house)}
        labels={{
          signIn: saving === 'this' ? VOTE.saving : VOTE.signIn,
          vote: saving === 'this' ? VOTE.saving : state === 'change' ? VOTE.change : VOTE.vote,
          voted: VOTE.pick,
          own: VOTE.own,
          opensSoon: VOTE.notYet(opensAt ? new Date(opensAt) : null),
          closed: state === 'paused' ? VOTE.paused : VOTE.closed,
        }}
      />
    </span>
  )
})
