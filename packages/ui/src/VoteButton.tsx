import { cn } from './cn'
import { DEFAULT_VOTE_BUTTON_LABELS, voteButtonState, type VoteButtonLabels } from './labels'

export interface VoteButtonProps {
  isMyVote: boolean
  votingOpen: boolean
  beforeOpen: boolean
  signedIn: boolean
  busy?: boolean
  /** The viewer's own entry (lights blocks self-votes): shows `labels.own`, disabled. */
  isOwn?: boolean
  onVote: () => void
  labels?: Partial<VoteButtonLabels>
  className?: string
}

/** The vote CTA with its label logic. Disabled while busy, outside the window, or on your own entry. */
export function VoteButton({ isMyVote, votingOpen, beforeOpen, signedIn, busy = false, isOwn = false, onVote, labels, className }: VoteButtonProps) {
  const l = { ...DEFAULT_VOTE_BUTTON_LABELS, ...labels }
  const state = voteButtonState({ isMyVote, isOwn, votingOpen, beforeOpen })
  const text = {
    voted: l.voted,
    own: l.own,
    'before-open': l.opensSoon,
    closed: l.closed,
    open: signedIn ? l.vote : l.signIn,
  }[state]
  return (
    <button
      type="button"
      data-slot="vote-button"
      data-state={state}
      disabled={busy || !votingOpen || isOwn}
      onClick={onVote}
      className={cn(
        'rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
        isMyVote
          ? 'bg-primary text-primary-fg'
          : 'border border-fg/25 text-fg hover:border-fg hover:bg-fg hover:text-bg',
        className,
      )}
    >
      {text}
    </button>
  )
}
