import { ADMIN } from '../../copy'
import { mapsSearchUrl } from '../../lib/geo'
import type { EntryRow, HouseStatus } from '../../types'
import { StatusPill } from '../StatusPill'

interface Props {
  row: EntryRow
  busy: boolean
  onStatus: (status: HouseStatus) => void
  onEdit: () => void
  onDelete: () => void
}

/** One entry in the queue: photo, number, name, address, pin link, times, actions. */
export function AdminRow({ row, busy, onStatus, onEdit, onDelete }: Props) {
  const edited = row.updated_at !== row.created_at
  return (
    <article data-slot="admin-row" data-status={row.status} aria-busy={busy || undefined}>
      <a href={row.photo_url} target="_blank" rel="noreferrer" data-slot="admin-photo" title={ADMIN.openPhoto}>
        <img src={row.photo_url} alt={`No. ${row.entry_number}: ${row.address}`} loading="lazy" decoding="async" />
      </a>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span data-slot="house-number">
            No.<b>{row.entry_number}</b>
          </span>
          <StatusPill status={row.status} />
        </div>
        <h3 data-slot="house-title">{row.title ?? <span className="text-fg/75">{ADMIN.noTitle}</span>}</h3>
        <p className="text-fg/85">{row.address}</p>
        <p className="text-sm text-fg/75">
          {ADMIN.submitted(row.created_at)}
          {edited && `, ${ADMIN.edited(row.updated_at)}`}
        </p>
        <a href={mapsSearchUrl(row)} target="_blank" rel="noreferrer" data-slot="text-button">
          {ADMIN.viewMap} <span aria-hidden="true">↗</span>
        </a>
        <div className="flex flex-wrap gap-3 pt-2">
          {row.status !== 'approved' && (
            <button type="button" className="btn-bulb" disabled={busy} onClick={() => onStatus('approved')}>
              {row.status === 'hidden' ? ADMIN.unhide : ADMIN.approve}
            </button>
          )}
          {row.status !== 'hidden' && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => onStatus('hidden')}>
              {ADMIN.hide}
            </button>
          )}
          <button type="button" className="btn-ghost" disabled={busy} onClick={onEdit}>
            {ADMIN.edit}
          </button>
          {row.status === 'hidden' && (
            <button type="button" className="btn-ghost" data-tone="danger" disabled={busy} onClick={onDelete}>
              {ADMIN.delete}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
