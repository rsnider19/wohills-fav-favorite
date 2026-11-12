import { useState } from 'react'
import { useSupabase } from '@wohills/core'
import { Dialog } from '@wohills/ui'
import { ENTER, MY_ENTRY } from '../../copy'
import { entryErrorKind } from '../../lib/entry'
import { EntryLockedError, withdrawEntry } from '../../lib/submit'
import type { EntryRow } from '../../types'
import { HouseCard } from '../HouseCard'
import { Note } from '../Page'
import { StatusPill } from '../StatusPill'

interface Props {
  entry: EntryRow
  canEdit: boolean
  votingStarted: boolean
  votingOpensAt: Date | null
  onEdit: () => void
  onWithdrawn: () => void
  onError: (message: string) => void
}

/** The owner's view of their entry: status, the card, and edit/withdraw while allowed. */
export function MyEntry({ entry, canEdit, votingStarted, votingOpensAt, onEdit, onWithdrawn, onError }: Props) {
  const client = useSupabase()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function withdraw() {
    setBusy(true)
    try {
      await withdrawEntry(client, entry)
      setConfirming(false)
      onWithdrawn()
    } catch (err) {
      setConfirming(false)
      onError(
        err instanceof EntryLockedError
          ? ENTER.sendErrors[votingStarted ? 'locked' : 'lockedClosed']
          : MY_ENTRY.withdrawFailed[entryErrorKind(err) === 'network' ? 'network' : 'unknown'],
      )
    } finally {
      setBusy(false)
    }
  }

  const lineup = `/?house=${entry.entry_number}#houses`
  return (
    <div data-slot="my-entry" data-status={entry.status} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={entry.status} />
        <span className="text-sm text-fg/75">{MY_ENTRY.updated(entry.updated_at)}</span>
      </div>
      <p className="text-lg leading-relaxed text-fg/85">
        {entry.status === 'approved' ? MY_ENTRY.body.approved(entry.entry_number) : MY_ENTRY.body[entry.status]}
      </p>

      <div className="mx-auto max-w-sm">
        <HouseCard house={entry} />
      </div>

      {entry.status === 'approved' && (
        <div className="flex flex-wrap gap-3">
          <a href={lineup} className="btn-ghost">
            {MY_ENTRY.seeInLineup}
          </a>
          <a href={`/?view=map&house=${entry.entry_number}#houses`} className="btn-ghost">
            {MY_ENTRY.seeOnMap}
          </a>
        </div>
      )}

      <div className="space-y-4 border-t border-fg/10 pt-6">
        {canEdit ? (
          <>
            <Note tone="info">{MY_ENTRY.canEdit(votingOpensAt)}</Note>
            {entry.status === 'approved' && <Note tone="error">{MY_ENTRY.editApprovedNote}</Note>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-bulb" onClick={onEdit}>
                {MY_ENTRY.edit}
              </button>
              <button type="button" className="btn-ghost" data-tone="danger" onClick={() => setConfirming(true)}>
                {MY_ENTRY.withdraw}
              </button>
            </div>
          </>
        ) : (
          <Note tone="info">{votingStarted ? MY_ENTRY.locked.voting : MY_ENTRY.locked.closed}</Note>
        )}
      </div>

      {confirming && (
        <Dialog label={MY_ENTRY.withdrawTitle} onClose={() => !busy && setConfirming(false)}>
          <h2 data-slot="dialog-title">{MY_ENTRY.withdrawTitle}</h2>
          <p className="mt-3 text-fg/75">{MY_ENTRY.withdrawBody}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn-ghost" data-tone="danger" disabled={busy} onClick={withdraw}>
              {busy ? MY_ENTRY.withdrawing : MY_ENTRY.withdrawConfirm}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
              {MY_ENTRY.withdrawCancel}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
