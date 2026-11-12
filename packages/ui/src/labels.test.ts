import { expect, it } from 'vitest'
import { voteButtonState } from './labels'

it.each([
  [{ isMyVote: true, votingOpen: false, beforeOpen: false }, 'voted'],
  [{ isMyVote: false, isOwn: true, votingOpen: true, beforeOpen: false }, 'own'],
  [{ isMyVote: false, votingOpen: false, beforeOpen: true }, 'before-open'],
  [{ isMyVote: false, votingOpen: false, beforeOpen: false }, 'closed'],
  [{ isMyVote: false, votingOpen: true, beforeOpen: false }, 'open'],
] as const)('%o → %s', (input, state) => expect(voteButtonState(input)).toBe(state))
