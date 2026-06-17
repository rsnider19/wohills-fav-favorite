import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Entry, ResultRow, Settings } from './types'
import Countdown from './components/Countdown'
import EntryCard from './components/EntryCard'
import PhoneAuth from './components/PhoneAuth'
import Results from './components/Results'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [settings, setSettings] = useState<Settings>({
    voting_open: true,
    results_visible: false,
    voting_opens_at: null,
    voting_closes_at: null,
  })
  const [myVote, setMyVote] = useState<string | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])
  // Secret pre-voting sign-in (for the admin to upload photos): visiting
  // /?signin opens the modal, as does 5 quick taps on the header badge.
  // Harmless if discovered — voting outside the window is still blocked by RLS.
  const [showAuth, setShowAuth] = useState(
    () => new URLSearchParams(window.location.search).has('signin'),
  )
  const secretTaps = useRef({ count: 0, timer: 0 })
  const [pendingVote, setPendingVote] = useState<Entry | null>(null)
  const [voteBusy, setVoteBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [now, setNow] = useState(() => new Date())
  // TEMP: header toggle to preview pre-vote vs. live-voting UI without touching
  // the database. null = use real settings/clock. Remove when done previewing.
  const [previewMode, setPreviewMode] = useState<'prevote' | 'live' | null>(null)

  // The window is enforced server-side by RLS against the database clock;
  // this clock only drives the countdown display and button states.
  const opensAt = settings.voting_opens_at ? new Date(settings.voting_opens_at) : null
  const closesAt = settings.voting_closes_at ? new Date(settings.voting_closes_at) : null
  const realBeforeOpen = opensAt !== null && now < opensAt
  const realAfterClose = closesAt !== null && now >= closesAt
  const beforeOpen = previewMode ? previewMode === 'prevote' : realBeforeOpen
  const afterClose = previewMode ? false : realAfterClose
  const votingOpen = previewMode
    ? previewMode === 'live'
    : settings.voting_open && !beforeOpen && !afterClose

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) setMyVote(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    const [{ data: entryRows }, { data: settingsRow }] = await Promise.all([
      supabase.from('entries').select('*').order('entry_number'),
      supabase
        .from('settings')
        .select('voting_open, results_visible, voting_opens_at, voting_closes_at')
        .single(),
    ])
    if (entryRows) setEntries(entryRows)
    if (settingsRow) {
      setSettings(settingsRow)
      if (settingsRow.results_visible) {
        const { data } = await supabase.rpc('get_results')
        if (data) setResults(data)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const firstLoad = setTimeout(refresh, 0)
    const interval = setInterval(refresh, 30_000)
    return () => {
      clearTimeout(firstLoad)
      clearInterval(interval)
    }
  }, [refresh])

  // Re-fetch the moment a window boundary passes so the UI flips immediately
  // instead of waiting out the 30-second poll.
  useEffect(() => {
    if (loading) return
    const t = setTimeout(refresh, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeOpen, afterClose])

  useEffect(() => {
    if (!session || pendingVote) return
    supabase
      .from('votes')
      .select('entry_id')
      .maybeSingle()
      .then(({ data }) => setMyVote(data?.entry_id ?? null))
  }, [session, pendingVote])

  // The admin (matched by phone in the database) gets photo-upload buttons.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const admin = session ? (await supabase.rpc('is_admin')).data === true : false
      if (!cancelled) setIsAdmin(admin)
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  const flashToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const submitVote = useCallback(
    async (entry: Entry, userId: string, previous: string | null) => {
      // The PK on votes.user_id makes this an insert-or-change-my-vote, never a second vote.
      const { error } = await supabase
        .from('votes')
        .upsert({ user_id: userId, entry_id: entry.id }, { onConflict: 'user_id' })
      if (error) {
        flashToast('Could not save your vote — voting may be closed.')
        return
      }
      setMyVote(entry.id)
      flashToast(
        previous
          ? `Vote changed to ${entry.theme || entry.street} ★`
          : `Vote cast for ${entry.theme || entry.street} ★`,
      )
    },
    [flashToast],
  )

  // Apply the vote that opened the sign-in modal once auth completes.
  useEffect(() => {
    if (!session || !pendingVote) return
    const entry = pendingVote
    ;(async () => {
      await submitVote(entry, session.user.id, null)
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
    await submitVote(entry, session.user.id, myVote)
    setVoteBusy(false)
  }

  function handleSecretTap() {
    const taps = secretTaps.current
    window.clearTimeout(taps.timer)
    taps.count += 1
    if (taps.count >= 5) {
      taps.count = 0
      setShowAuth(true)
      return
    }
    taps.timer = window.setTimeout(() => {
      taps.count = 0
    }, 1500)
  }

  const ticker = 'Worthington Hills ✦ 4th of July 2026 ✦ Fan Favorite ✦ One Neighbor, One Vote ✦ '

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6">
        <div
          className="rise inline-block text-xs font-semibold tracking-[0.2em] text-ink/50 uppercase select-none"
          onClick={handleSecretTap}
        >
          Worthington Hills Parade
        </div>
        {/* TEMP: preview toggle — remove before launch */}
        <button
          type="button"
          onClick={() =>
            setPreviewMode((m) => (m === null ? 'prevote' : m === 'prevote' ? 'live' : null))
          }
          className="rounded-full border border-ink/20 bg-card px-3 py-1 text-[0.65rem] font-semibold tracking-[0.15em] text-ink/60 uppercase"
        >
          {previewMode === 'prevote'
            ? 'Preview: Pre-Vote'
            : previewMode === 'live'
              ? 'Preview: Live'
              : 'Preview: Live Settings'}
        </button>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-14 sm:pt-20">
        <p
          className="rise mb-5 text-xs font-semibold tracking-[0.25em] text-red uppercase"
          style={{ animationDelay: '0.05s' }}
        >
          July 4th, 2026 ✦ Fan Favorite Ballot
        </p>
        <h1
          className="rise font-display text-[clamp(3.25rem,11vw,8rem)] leading-[0.92] font-semibold tracking-tight text-ink"
          style={{ animationDelay: '0.12s' }}
        >
          Dynamic
          <br />
          <em className="font-light text-red">Duos</em>
          <span className="align-top text-[0.35em] text-cobalt"> ★</span>
        </h1>
        <div
          className="rise mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
          style={{ animationDelay: '0.2s' }}
        >
          <p className="max-w-md leading-relaxed text-ink/65">
            Every street built a float around a dynamic duo. Pick the one that stole the show —
            one vote per neighbor, and you can change your mind any time before voting closes.
          </p>
          <p className="shrink-0 text-sm text-ink/45">
            {settings.results_visible
              ? 'Results are in'
              : votingOpen
                ? 'Voting is open'
                : beforeOpen
                  ? 'Voting opens soon'
                  : 'Voting is closed'}{' '}
            · {entries.length || 6} entries
          </p>
        </div>
        {!loading && beforeOpen && opensAt && (
          <div className="rise mt-10 max-w-xl" style={{ animationDelay: '0.28s' }}>
            <Countdown label="Voting opens in" target={opensAt} now={now} />
          </div>
        )}
        {!loading && votingOpen && closesAt && (
          <div className="rise mt-10 max-w-xl" style={{ animationDelay: '0.28s' }}>
            <Countdown label="Voting closes in" target={closesAt} now={now} />
          </div>
        )}
        {!loading && !votingOpen && !beforeOpen && !settings.results_visible && (
          <div className="rise mt-8 inline-block rounded-xl border border-ink/15 bg-card px-5 py-3 text-sm text-ink/70">
            Voting is closed. Results will be announced soon — stay tuned.
          </div>
        )}
      </section>

      {/* Ticker */}
      <div className="marquee border-y border-ink/15 py-2.5" aria-hidden="true">
        <div className="marquee-track font-display text-sm tracking-wide text-ink/60 italic">
          <span>{ticker.repeat(4)}</span>
          <span>{ticker.repeat(4)}</span>
        </div>
      </div>

      {/* Results (once revealed) */}
      {settings.results_visible && results.length > 0 && <Results results={results} />}

      {/* Ballot */}
      <main className="mx-auto w-full max-w-6xl px-5 py-14">
        <h2 className="mb-8 font-display text-3xl font-semibold text-ink sm:text-4xl">
          {settings.results_visible ? 'The Lineup' : 'Cast Your Vote'}
        </h2>
        {loading ? (
          <div className="animate-pulse py-16 text-ink/40">Loading the lineup…</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry, i) => (
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
                    flashToast(message)
                    if (ok) refresh()
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-ink/15">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-8 text-sm text-ink/45 sm:flex-row sm:items-center sm:justify-between">
          <span>Made with ❤️ for Worthington Hills</span>
          <span>
            One phone number, one vote <span className="text-red">★</span>
          </span>
        </div>
      </footer>

      {showAuth && (
        <PhoneAuth
          voteFor={pendingVote ? pendingVote.theme || pendingVote.street : undefined}
          onSuccess={() => setShowAuth(false)}
          onCancel={() => {
            setShowAuth(false)
            setPendingVote(null)
          }}
        />
      )}

      {toast && (
        <div className="pop fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
