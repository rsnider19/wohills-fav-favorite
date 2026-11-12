import { VoteButton } from '@wohills/ui'
import { VOTE_LABELS } from '../copy'
import type { Entry } from '../types'
import AdminEditButton from './AdminEditButton'
import AdminPhotoButton from './AdminPhotoButton'

interface Props {
  entry: Entry
  isMyVote: boolean
  votingOpen: boolean
  beforeOpen: boolean
  signedIn: boolean
  busy: boolean
  isAdmin: boolean
  /** Before the window opens, themes/photos stay under wraps. */
  mystery: boolean
  onVote: (entry: Entry) => void
  onAdminDone: (message: string, ok: boolean) => void
}

export default function EntryCard({
  entry,
  isMyVote,
  votingOpen,
  beforeOpen,
  signedIn,
  busy,
  isAdmin,
  mystery,
  onVote,
  onAdminDone,
}: Props) {
  if (mystery) {
    return (
      <article className="relative flex h-full flex-col overflow-hidden rounded-card border border-fg/15 bg-surface">
        {isAdmin && (
          <div className="absolute top-3 left-3 z-10 flex gap-2">
            <AdminPhotoButton entry={entry} onDone={onAdminDone} />
            <AdminEditButton entry={entry} onDone={onAdminDone} />
          </div>
        )}
        <div className="flex aspect-[4/3] items-center justify-center border-b border-fg/10 bg-sunken">
          <span className="font-display text-8xl font-light text-fg/15 italic select-none">?</span>
        </div>
        <div className="flex grow flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-[1.65rem] leading-tight font-semibold">
                {entry.street}
              </h3>
            </div>
            <span className="text-3xl leading-none">{entry.emoji}</span>
          </div>
          <div className="mb-6 grow" />
          <button
            type="button"
            disabled
            className="mt-auto rounded-full border border-fg/25 px-4 py-2.5 text-sm font-semibold opacity-40"
          >
            Voting opens soon
          </button>
        </div>
      </article>
    )
  }

  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-card border transition duration-300 ${
        isMyVote
          ? 'border-fg bg-fg text-bg shadow-selected'
          : 'border-fg/15 bg-surface hover:-translate-y-1 hover:border-fg/40 hover:shadow-card-hover'
      }`}
    >
      {entry.image_url && (
        <img
          src={entry.image_url}
          alt={`The ${entry.theme} float by ${entry.street}`}
          loading="lazy"
          className="aspect-[4/3] w-full border-b border-fg/10 object-cover"
        />
      )}

      {isMyVote && (
        <div className="pop absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-[11px] font-bold tracking-wider text-primary-fg uppercase shadow-md">
          ★ Your pick
        </div>
      )}

      {isAdmin && (
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <AdminPhotoButton entry={entry} onDone={onAdminDone} />
          <AdminEditButton entry={entry} onDone={onAdminDone} />
        </div>
      )}

      <div className="flex grow flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[1.65rem] leading-tight font-semibold">
              {entry.theme || entry.street}
            </h3>
            {entry.theme && (
              <div
                className={`mt-1 text-xs font-semibold tracking-[0.15em] uppercase ${
                  isMyVote ? 'text-bg/50' : 'text-fg/45'
                }`}
              >
                {entry.street}
              </div>
            )}
          </div>
          <span className="text-3xl leading-none">{entry.emoji}</span>
        </div>

        {entry.description && (
          <p
            className={`mt-3 mb-6 grow text-sm leading-relaxed ${
              isMyVote ? 'text-bg/75' : 'text-fg/65'
            }`}
          >
            {entry.description}
          </p>
        )}

        <VoteButton
          isMyVote={isMyVote}
          votingOpen={votingOpen}
          beforeOpen={beforeOpen}
          signedIn={signedIn}
          busy={busy}
          onVote={() => onVote(entry)}
          labels={VOTE_LABELS}
          className="mt-auto"
        />
      </div>
    </article>
  )
}
