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
  onVote,
  onAdminDone,
}: Props) {
  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border transition duration-300 ${
        isMyVote
          ? 'border-ink bg-ink text-paper shadow-[0_16px_40px_-12px_rgba(27,34,48,0.45)]'
          : 'border-ink/15 bg-card hover:-translate-y-1 hover:border-ink/40 hover:shadow-[0_16px_40px_-20px_rgba(27,34,48,0.35)]'
      }`}
    >
      {entry.image_url && (
        <img
          src={entry.image_url}
          alt={`The ${entry.theme} float by ${entry.street}`}
          loading="lazy"
          className="aspect-[4/3] w-full border-b border-ink/10 object-cover"
        />
      )}

      {isMyVote && (
        <div className="pop absolute top-3 right-3 rounded-full bg-red px-3 py-1 text-[11px] font-bold tracking-wider text-paper uppercase shadow-md">
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
              {entry.theme}
            </h3>
            <div
              className={`mt-1 text-xs font-semibold tracking-[0.15em] uppercase ${
                isMyVote ? 'text-paper/50' : 'text-ink/45'
              }`}
            >
              {entry.street}
            </div>
          </div>
          <span className="text-3xl leading-none">{entry.emoji}</span>
        </div>

        {entry.description && (
          <p
            className={`mt-3 mb-6 grow text-sm leading-relaxed ${
              isMyVote ? 'text-paper/75' : 'text-ink/65'
            }`}
          >
            {entry.description}
          </p>
        )}

        <button
          type="button"
          disabled={busy || !votingOpen}
          onClick={() => onVote(entry)}
          className={`mt-auto rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isMyVote
              ? 'bg-red text-paper'
              : 'border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-paper'
          }`}
        >
          {isMyVote
            ? 'Voted ✓'
            : !votingOpen
              ? beforeOpen
                ? 'Voting opens soon'
                : 'Voting closed'
              : signedIn
                ? 'Vote for this float'
                : 'Sign in to vote'}
        </button>
      </div>
    </article>
  )
}
