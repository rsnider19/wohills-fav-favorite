import { useCallback, useEffect, useState } from 'react'
import {
  useContestSettings,
  useIsAdmin,
  useMyVote,
  useNow,
  usePolling,
  useResults,
  useSecretTaps,
  useSession,
  useShuffledOrder,
  useToast,
  useVotingWindow,
  type WindowPreview,
} from '@wohills/core'
import { Countdown, Leaderboard, Marquee, PhoneAuthDialog, Toaster } from '@wohills/ui'
import { supabase } from './lib/supabase'
import type { Entry, ResultRow } from './types'
import { AUTH_LABELS, TICKER } from './copy'
import badge from './assets/dynamic-duos-badge.png'
import EntryCard from './components/EntryCard'

// Module-level so useShuffledOrder's memo stays stable across renders.
const entryId = (e: Entry) => e.id
const entryNumber = (e: Entry) => String(e.entry_number)

async function loadEntries() {
  return (await supabase.from('entries').select('*').order('entry_number')).data as Entry[] | null
}

export default function App() {
  const { session } = useSession()
  const now = useNow()
  const { settings, loading: settingsLoading, refresh: refreshSettings } = useContestSettings()
  const { data: entries = [], loading: entriesLoading, refresh: refreshEntries } = usePolling(loadEntries)
  const { results, refresh: refreshResults } = useResults<ResultRow>(settings.results_visible)
  const loading = settingsLoading || entriesLoading
  const isAdmin = useIsAdmin(session)
  const { toast, flash } = useToast()

  // Secret pre-voting sign-in (for the admin to upload photos): visiting
  // /?signin opens the modal, as do 5 quick taps on the header badge.
  // Harmless if discovered — voting outside the window is still blocked by RLS.
  const [showAuth, setShowAuth] = useState(() => new URLSearchParams(window.location.search).has('signin'))
  const onSecretTap = useSecretTaps(() => setShowAuth(true))
  const [pendingVote, setPendingVote] = useState<Entry | null>(null)
  const [voteBusy, setVoteBusy] = useState(false)
  const { myVote, vote } = useMyVote(session, { column: 'entry_id', paused: pendingVote !== null })
  // TEMP: header toggle to preview pre-vote vs. live-voting UI without touching
  // the database. null = use real settings/clock. Remove when done previewing.
  const [previewMode, setPreviewMode] = useState<WindowPreview>(null)

  // The window is enforced server-side by RLS against the database clock;
  // this clock only drives the countdown display and button states.
  const { opensAt, closesAt, beforeOpen, afterClose, votingOpen } = useVotingWindow(settings, now, previewMode)

  const refreshAll = useCallback(() => {
    refreshSettings()
    refreshEntries()
    refreshResults()
  }, [refreshSettings, refreshEntries, refreshResults])

  // Re-fetch the moment a window boundary passes so the UI flips immediately
  // instead of waiting out the 30-second poll.
  useEffect(() => {
    if (loading) return
    const t = setTimeout(refreshAll, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeOpen, afterClose])

  const submitVote = useCallback(
    async (entry: Entry, previous: string | null) => {
      const { error } = await vote(entry.id)
      if (error) {
        flash('Could not save your vote — voting may be closed.')
        return
      }
      flash(
        previous
          ? `Vote changed to ${entry.theme || entry.street} ★`
          : `Vote cast for ${entry.theme || entry.street} ★`,
      )
    },
    [vote, flash],
  )

  // Apply the vote that opened the sign-in modal once auth completes.
  useEffect(() => {
    if (!session || !pendingVote) return
    const entry = pendingVote
    ;(async () => {
      await submitVote(entry, null)
      setPendingVote(null)
    })()
  }, [session, pendingVote, submitVote])

  async function castVote(entry: Entry) {
    if (!votingOpen) return
    if (!session) {
      setPendingVote(entry)
      setShowAuth(true)
      return
    }
    if (entry.id === myVote) return
    setVoteBusy(true)
    await submitVote(entry, myVote)
    setVoteBusy(false)
  }

  // Ballot order: randomized so no float gets a positional advantage, with an
  // optional ?f=<entry number> override that floats one entry to the very top.
  const orderedEntries = useShuffledOrder(entries, { getId: entryId, getPinKey: entryNumber })

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6">
        <div
          className="rise inline-block text-xs font-semibold tracking-[0.2em] text-fg/50 uppercase select-none"
          onClick={onSecretTap}
        >
          Worthington Hills Parade
        </div>
        {/* TEMP: admin-only preview toggle — remove before launch */}
        {isAdmin && (
          <button
            type="button"
            onClick={() =>
              setPreviewMode((m) => (m === null ? 'prevote' : m === 'prevote' ? 'live' : null))
            }
            className="rounded-full border border-fg/20 bg-surface px-3 py-1 text-[0.65rem] font-semibold tracking-[0.15em] text-fg/60 uppercase"
          >
            {previewMode === 'prevote'
              ? 'Preview: Pre-Vote'
              : previewMode === 'live'
                ? 'Preview: Live'
                : 'Preview: Live Settings'}
          </button>
        )}
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-14 sm:pt-20">
        <p
          className="rise mb-5 text-xs font-semibold tracking-[0.25em] text-primary uppercase"
          style={{ animationDelay: '0.05s' }}
        >
          July 4th, 2026 ✦ Fan Favorite Ballot
        </p>
        <h1 className="sr-only">Worthington Hills Dynamic Duos</h1>
        <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-12">
          <div className="w-full lg:w-1/2">
            <img
              src={badge}
              alt="Worthington Hills Dynamic Duos 2026 — America's Semiquincentennial"
              className="rise mx-auto w-full max-w-xs sm:max-w-sm"
              style={{ animationDelay: '0.12s' }}
            />
          </div>
          <div className="w-full lg:w-1/2">
            {!loading && beforeOpen && opensAt && (
              <div className="rise" style={{ animationDelay: '0.28s' }}>
                <Countdown label="Voting opens in" labelPrefix="★ " target={opensAt} now={now} />
              </div>
            )}
            {!loading && votingOpen && closesAt && (
              <div className="rise" style={{ animationDelay: '0.28s' }}>
                <Countdown label="Voting closes in" labelPrefix="★ " target={closesAt} now={now} />
              </div>
            )}
          </div>
        </div>
        {!loading && !votingOpen && !beforeOpen && !settings.results_visible && (
          <div className="rise mt-8 inline-block rounded-xl border border-fg/15 bg-surface px-5 py-3 text-sm text-fg/70">
            Voting is closed. Results will be announced soon — stay tuned.
          </div>
        )}
      </section>

      <Marquee
        text={TICKER}
        className="border-y border-fg/15 py-2.5"
        trackClassName="font-display text-sm tracking-wide text-fg/60 italic"
      />

      {/* Results (once revealed). The SQL returns the top 3; the slice keeps
          the page right against a database that hasn't had that migration yet. */}
      {settings.results_visible && results.length > 0 && (
        <Leaderboard
          eyebrow="★ The results are in"
          title="Fan Favorite"
          rows={results.slice(0, 3).map((r) => ({
            id: r.entry_id,
            title: r.theme || r.street,
            subtitle: r.street,
            imageUrl: r.image_url,
            imageAlt: `The ${r.theme} float by ${r.street}`,
            icon: r.emoji,
            count: r.vote_count,
          }))}
        />
      )}

      {/* Ballot */}
      <main className="mx-auto w-full max-w-6xl px-5 py-14">
        <h2 className="mb-8 font-display text-3xl font-semibold text-fg sm:text-4xl">
          {settings.results_visible ? 'The Lineup' : 'Cast Your Vote'}
        </h2>
        {loading ? (
          <div className="animate-pulse py-16 text-fg/40">Loading the lineup…</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {orderedEntries.map((entry, i) => (
              <div key={entry.id} className="rise" style={{ animationDelay: `${0.08 * i}s` }}>
                <EntryCard
                  entry={entry}
                  isMyVote={entry.id === myVote}
                  votingOpen={votingOpen}
                  beforeOpen={beforeOpen}
                  signedIn={!!session}
                  busy={voteBusy}
                  isAdmin={isAdmin}
                  mystery={beforeOpen}
                  onVote={castVote}
                  onAdminDone={(message, ok) => {
                    flash(message)
                    if (ok) refreshAll()
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-fg/15">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-8 text-sm text-fg/45 sm:flex-row sm:items-center sm:justify-between">
          <span>Made with ❤️ for Worthington Hills</span>
          <span>
            One phone number, one vote <span className="text-primary">★</span>
          </span>
        </div>
      </footer>

      {showAuth && (
        <PhoneAuthDialog
          labels={AUTH_LABELS}
          notice={
            // JSX (not a template string) on purpose: separate text nodes shape
            // exactly like the original markup, which the pixel-parity check needs.
            pendingVote ? (
              <>Your vote for {pendingVote.theme || pendingVote.street} will be cast as soon as you verify.</>
            ) : undefined
          }
          onSuccess={() => setShowAuth(false)}
          onCancel={() => {
            setShowAuth(false)
            setPendingVote(null)
          }}
        />
      )}

      <Toaster message={toast} />
    </div>
  )
}
