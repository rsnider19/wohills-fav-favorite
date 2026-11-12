import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useSupabase } from '@wohills/core'
import { ADMIN } from '../../copy'
import { adminDeleteEntry, adminEditEntry, useAdminCheck, type AdminEdit } from '../../lib/entries'
import type { EntryRow, HouseStatus } from '../../types'
import { Page, Panel } from '../Page'
import { AdminDeleteDialog, AdminEditDialog } from './AdminDialogs'
import { AdminRow } from './AdminRow'

interface Props {
  session: Session | null
  sessionReady: boolean
  rows: EntryRow[] | undefined
  setStatus: (id: string, status: HouseStatus) => Promise<void>
  refresh: () => Promise<void>
  /** The public lineup changed (approve, hide, edit, delete): refresh it now. */
  onChanged: () => void
  onSignIn: () => void
  flash: (message: string) => void
}

const TABS: HouseStatus[] = ['pending', 'approved', 'hidden']

/** /admin: the moderation queue. Reached from the footer link (admin only) or by URL;
 *  everyone else gets a sign-in prompt or "not the admin". RLS enforces it either way. */
export function AdminPage({ session, sessionReady, rows, setStatus, refresh, onChanged, onSignIn, flash }: Props) {
  const client = useSupabase()
  const isAdmin = useAdminCheck(session)
  const [tab, setTab] = useState<HouseStatus>('pending')
  const [editing, setEditing] = useState<EntryRow | null>(null)
  const [deleting, setDeleting] = useState<EntryRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function changeStatus(row: EntryRow, status: HouseStatus) {
    setBusyId(row.id)
    try {
      await setStatus(row.id, status)
      flash(ADMIN.toasts[status](row.entry_number))
      onChanged()
    } catch {
      flash(ADMIN.toasts.failed)
    } finally {
      setBusyId(null)
    }
  }

  async function saveEdit(row: EntryRow, edit: AdminEdit) {
    await adminEditEntry(client, row, edit)
    setEditing(null)
    flash(ADMIN.toasts.saved)
    await refresh()
    onChanged()
  }

  async function confirmDelete(row: EntryRow) {
    await adminDeleteEntry(client, row)
    setDeleting(null)
    flash(ADMIN.toasts.deleted)
    await refresh()
    onChanged()
  }

  let body
  if (!sessionReady || isAdmin === undefined) body = null
  else if (!session || !isAdmin) {
    body = (
      <Panel off>
        <p className="text-fg/75">{session ? ADMIN.notAdmin : ADMIN.signInBody}</p>
        {!session && (
          <button type="button" className="btn-bulb mt-6" onClick={onSignIn}>
            {ADMIN.signIn}
          </button>
        )}
      </Panel>
    )
  } else {
    const counts = Object.fromEntries(TABS.map((t) => [t, rows?.filter((r) => r.status === t).length ?? 0]))
    const shown = rows?.filter((r) => r.status === tab) ?? []
    body = (
      <>
        <div role="group" aria-label={ADMIN.show} data-slot="segmented" className="mb-6">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              data-state={tab === t ? 'on' : 'off'}
              onClick={() => setTab(t)}
            >
              {ADMIN.tabs[t]} <span data-slot="segmented-count">{counts[t]}</span>
            </button>
          ))}
        </div>
        <section aria-label={ADMIN.tabs[tab]}>
          {rows === undefined ? (
            <p role="status" className="text-fg/75">
              {ADMIN.loading}
            </p>
          ) : shown.length === 0 ? (
            <Panel off>
              <p className="text-fg/75">{ADMIN.empty[tab]}</p>
            </Panel>
          ) : (
            <ul className="space-y-5">
              {shown.map((row) => (
                <li key={row.id}>
                  <AdminRow
                    row={row}
                    busy={busyId === row.id}
                    onStatus={(s) => changeStatus(row, s)}
                    onEdit={() => setEditing(row)}
                    onDelete={() => setDeleting(row)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    )
  }

  return (
    <Page eyebrow={ADMIN.eyebrow} title={ADMIN.title} bulb="gold">
      {body}
      {editing && <AdminEditDialog row={editing} onSave={(edit) => saveEdit(editing, edit)} onClose={() => setEditing(null)} />}
      {deleting && <AdminDeleteDialog row={deleting} onConfirm={() => confirmDelete(deleting)} onClose={() => setDeleting(null)} />}
    </Page>
  )
}
