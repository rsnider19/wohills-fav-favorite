import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ENTER, MY_ENTRY, TOASTS } from '../../copy'
import type { ContestStatus } from '../../lib/phase'
import { navigate, onRouteClick, routeHref } from '../../lib/route'
import type { EntryRow, LightsSettings } from '../../types'
import { Page, Panel } from '../Page'
import { MyEntry } from './MyEntry'
import { SubmitWizard } from './SubmitWizard'

interface Props {
  session: Session | null
  /** The session and the settings have loaded (until then the page stays empty, so a
   *  default window never flashes "Not yet!"). */
  ready: boolean
  settings: LightsSettings
  status: ContestStatus
  now: Date
  /** undefined while unknown (signed out or loading), then the row or null. */
  entry: EntryRow | null | undefined
  /** Looking up the phone's entry failed (offline); `entry` is still undefined. */
  entryFailed: boolean
  refreshEntry: () => Promise<void>
  /** A change the gallery should pick up at once (withdrawn). */
  onChanged: () => void
  onSignIn: () => void
  flash: (message: string) => void
}

const toDate = (iso: string | null) => (iso ? new Date(iso) : null)

/** /enter: sign in, then the form, or "My entry" for a phone that already has one. */
export function EntryPage({ session, ready, settings, status, now, entry, entryFailed, refreshEntry, onChanged, onSignIn, flash }: Props) {
  // The row the form just created, until the poll catches up.
  const [sent, setSent] = useState<EntryRow | null>(null)
  // "You're on the list!" shows until they move on; separate from `sent`, so "See my entry"
  // shows the entry even if the refetch hasn't answered yet (never the empty form again).
  const [done, setDone] = useState(false)
  const [editing, setEditing] = useState(false)
  const votingOpensAt = toDate(settings.voting_opens_at)
  const votingStarted = votingOpensAt !== null && now >= votingOpensAt
  // Entries are open but owner edits are not (voting has opened: the windows overlap), so
  // a new entry is locked as soon as it exists. Mirrors lights.owner_edits_allowed().
  const late = status.submissionsOpen && !status.ownerCanEdit
  const mine = entry ?? (sent && sent.submitted_by === session?.user.id ? sent : null)

  let eyebrow = ENTER.eyebrow
  let title = ENTER.title
  let body
  if (!ready) {
    body = null
  } else if (!session) {
    body = status.submissionsOpen ? (
      <Panel>
        <p className="text-lg leading-relaxed text-fg/85">{ENTER.intro}</p>
        <ul data-slot="rules" className="mt-6 space-y-3">
          {ENTER.rules(votingOpensAt, late).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <button type="button" className="btn-bulb mt-8" onClick={onSignIn}>
          {ENTER.signInCta}
        </button>
      </Panel>
    ) : (
      <ClosedPanel status={status} settings={settings} now={now} onSignIn={onSignIn} />
    )
  } else if (entry === undefined && !sent) {
    body = entryFailed ? (
      <Panel off>
        <p role="alert" className="text-fg/75">
          {ENTER.checkFailed}
        </p>
        <button type="button" className="btn-ghost mt-6" onClick={() => void refreshEntry()}>
          {ENTER.retry}
        </button>
      </Panel>
    ) : (
      <Panel off>
        <p role="status" className="text-fg/75">
          {ENTER.checking}
        </p>
      </Panel>
    )
  } else if (mine && done && !editing) {
    eyebrow = ENTER.doneEyebrow
    title = ENTER.doneTitle
    body = (
      <Panel>
        <p className="text-lg leading-relaxed text-fg/85">{ENTER.doneBody}</p>
        <ol data-slot="next-steps" className="mt-6 space-y-3">
          {ENTER.doneNext(votingOpensAt, late).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="btn-bulb" onClick={() => setDone(false)}>
            {ENTER.seeMyEntry}
          </button>
          <a href={routeHref('home')} onClick={onRouteClick('home')} className="btn-ghost">
            {ENTER.backToLineup}
          </a>
        </div>
      </Panel>
    )
  } else if (mine && editing) {
    eyebrow = MY_ENTRY.editEyebrow
    title = MY_ENTRY.title
    body = (
      <Panel>
        <SubmitWizard
          key={`edit-${mine.id}`}
          mode="edit"
          uid={mine.submitted_by}
          house={mine}
          fence={settings}
          votingOpensAt={votingOpensAt}
          late={false}
          onDone={async (row) => {
            flash(mine.status === 'approved' && row.status === 'pending' ? TOASTS.savedPending : TOASTS.saved)
            setEditing(false)
            await refreshEntry()
            onChanged()
          }}
          onShowEntry={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Panel>
    )
  } else if (mine) {
    eyebrow = MY_ENTRY.eyebrow
    title = MY_ENTRY.title
    body = (
      <Panel>
        <MyEntry
          entry={mine}
          canEdit={status.ownerCanEdit}
          votingStarted={votingStarted}
          votingOpensAt={votingOpensAt}
          onEdit={() => setEditing(true)}
          onWithdrawn={async () => {
            setSent(null)
            setDone(false)
            await refreshEntry()
            onChanged()
            flash(TOASTS.withdrawn)
          }}
          onError={flash}
        />
      </Panel>
    )
  } else if (!status.submissionsOpen) {
    body = <ClosedPanel status={status} settings={settings} now={now} />
  } else {
    body = (
      <Panel>
        <SubmitWizard
          key={`new-${session.user.id}`}
          mode="new"
          uid={session.user.id}
          fence={settings}
          votingOpensAt={votingOpensAt}
          late={late}
          onDone={(row) => {
            setSent(row)
            setDone(true)
            refreshEntry()
          }}
          onShowEntry={() => refreshEntry()}
        />
      </Panel>
    )
  }

  return (
    <Page eyebrow={eyebrow} title={title} bulb={mine?.status === 'approved' && !editing ? 'green' : 'red'}>
      {body}
    </Page>
  )
}

/** Entries aren't open: not yet, paused by the admin (kill switch), or over. */
function ClosedPanel({ status, settings, now, onSignIn }: { status: ContestStatus; settings: LightsSettings; now: Date; onSignIn?: () => void }) {
  const opensAt = status.countdown?.kind === 'entries-open' ? status.countdown.target : null
  const closeAt = toDate(settings.submissions_close_at)
  const kind = opensAt ? 'before' : !settings.submissions_open && (!closeAt || now < closeAt) ? 'paused' : 'closed'
  return (
    <Panel off>
      <h2 data-slot="step-title">{ENTER.closedTitle[kind]}</h2>
      <p className="mt-3 text-fg/75">{kind === 'before' ? ENTER.closedBody.before(opensAt) : ENTER.closedBody[kind]}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {status.votingOpen && (
          <button type="button" className="btn-bulb" onClick={() => navigate('home')}>
            {ENTER.goVote}
          </button>
        )}
        {onSignIn && (
          <button type="button" className="btn-ghost" onClick={onSignIn}>
            {ENTER.signInToSee}
          </button>
        )}
      </div>
    </Panel>
  )
}
