import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CONTEST_SETTINGS_COLUMNS,
  type ContestSettings,
  useContestSettings,
  useIsAdmin,
  useMyVote,
  useNow,
  useResults,
  useSecretTaps,
  useSession,
  useSupabase,
  useToast,
} from '@wohills/core'
import { Marquee, PhoneAuthDialog, Toaster } from '@wohills/ui'
import type { House, LightsSettings } from './types'
import type { LightsResult } from './lib/reveal'
import {
  contestStatus,
  type Phase,
  DEFAULT_LIGHTS_SETTINGS,
  LIGHTS_SETTINGS_COLUMNS,
  parsePreview,
  previewSettings,
} from './lib/phase'
import { useApprovedHouses } from './lib/houses'
import { useAdminEntries, useMyEntry } from './lib/entries'
import { useMotion } from './lib/useMotion'
import { onRouteClick, routeHref, useRoute, type Route } from './lib/route'
import { geofence } from './lib/geo'
import { useView } from './lib/view'
import { AUTH_LABELS, ENTER, heroTagline, houseName, NAV, PODIUM, TICKER, TOASTS, VOTE } from './copy'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Gallery } from './components/Gallery'
import { Footer } from './components/Footer'
import { EntryPage } from './components/entry/EntryPage'
import { AdminPage } from './components/admin/AdminPage'
import { MapView } from './components/MapView'
import { prefetchMap } from './map/load'
import { NavigateButton } from './components/NavigateButton'
import { ViewToggle } from './components/ViewToggle'
import { Ballot } from './components/Ballot'
import { Podium } from './components/Podium'
import { Note } from './components/Page'
import { ballotState, countedPick, isNetworkError, pickWasHidden, voteProblem, windowShut, type VoteFacts } from './lib/ballot'
import { podiumRows, samplePodium } from './lib/reveal'

const toDate = (iso: string | null) => (iso ? new Date(iso) : null)

/** An in-app link (no reload) styled by the caller. */
function RouteLink({ to, className, children }: { to: Route; className: string; children: ReactNode }) {
  return (
    <a href={routeHref(to, window.location.search)} onClick={onRouteClick(to)} className={className}>
      {children}
    </a>
  )
}

export default function App() {
  const supabase = useSupabase()
  const { session, ready: sessionReady } = useSession()
  const now = useNow()
  const isAdmin = useIsAdmin(session)
  const route = useRoute()
  const { toast, flash } = useToast()
  const { motionOn, toggleMotion } = useMotion()
  const {
    settings: liveSettings,
    loading: settingsLoading,
    refresh: refreshSettings,
  } = useContestSettings<LightsSettings>({ columns: LIGHTS_SETTINGS_COLUMNS, initial: DEFAULT_LIGHTS_SETTINGS })
  const { data: houses, loading: housesLoading, refresh: refreshHouses } = useApprovedHouses()
  const { entry: myEntry, failed: myEntryFailed, refresh: refreshMyEntry } = useMyEntry(session)
  const admin = useAdminEntries(isAdmin)
  const [view, setView] = useView()

  // ?preview=<phase> shows another phase's look without touching the database:
  // always in `npm run dev`, and for the signed-in admin on a real build. Display only:
  // the database still enforces the real windows.
  const [preview] = useState(() => parsePreview(window.location.search))
  const [previewAnchor] = useState(() => new Date())
  const previewing = preview !== null && (import.meta.env.DEV || isAdmin)
  const settings = previewing ? previewSettings(preview, previewAnchor, liveSettings) : liveSettings
  // Until settings load, the hero is laid out from the defaults (the decided dates) but kept
  // invisible, so its space is reserved and nothing jumps when the real dates arrive (CLS).
  const status = contestStatus(settings, now)

  // Hidden sign-in for the admin before anything opens: /?signin or 5 taps on the hero eyebrow.
  // The /enter page opens the same dialog with a line saying why.
  const [auth, setAuth] = useState<{ notice?: string } | null>(() =>
    new URLSearchParams(window.location.search).has('signin') ? {} : null,
  )
  const onSecretTap = useSecretTaps(() => setAuth({}))

  // Votes (M7): the parade's pattern on the shared hooks. A vote chosen while signed out
  // waits in `pendingVote` through the sign-in, and useMyVote holds its read meanwhile.
  const [pendingVote, setPendingVote] = useState<House | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const { myVote, loading: voteLoading, vote } = useMyVote(session, { column: 'house_id', paused: pendingVote !== null })
  // Real results only once the database has revealed them; get_results() returns nothing
  // before that, even for the admin (M3 lights_30). The admin's ?preview=results shows a
  // sample podium instead, with no counts (lib/reveal.ts). A failed call keeps "loading"
  // (core's useResults), so it never reads as "no votes were cast".
  const { results, loading: resultsLoading } = useResults<LightsResult>(liveSettings.results_visible)
  const sample = previewing && preview === 'results' && !liveSettings.results_visible

  // Callbacks handed to the memoized cards read the latest values from here, so they
  // stay the same function between renders.
  const latest = useRef({ session, myVote, votingOpen: status.votingOpen, settings, now })
  useEffect(() => {
    latest.current = { session, myVote, votingOpen: status.votingOpen, settings, now }
  })

  // One vote action at a time (D6). The buttons are disabled while one saves, but a ref
  // also covers what a re-render can't: a second tap in the same frame, and a vote picked
  // before the sign-in landing (it reads the account's vote first) while the visitor taps
  // another house. `savingId` keeps that house's button on "Saving…" until it's all done.
  const busy = useRef(false)
  const exclusive = useCallback(async (houseId: string, work: () => Promise<void>) => {
    if (busy.current) return
    busy.current = true
    setSavingId(houseId)
    try {
      await work()
    } finally {
      busy.current = false
      setSavingId(null)
    }
  }, [])

  /** Cast or change the vote, wait for the database (no optimistic pick: a lit card must
   *  mean a counted vote), then say what happened. Run inside `exclusive`. */
  const submitVote = useCallback(
    async (house: House, previous: string | null) => {
      const { error } = await vote(house.id)
      const name = houseName(house)
      if (!error) {
        flash(previous !== null && previous !== house.id ? VOTE.toasts.changed(name) : VOTE.toasts.cast(name))
        return
      }
      // RLS refuses with one code for every reason (M3 D26): ask what changed.
      let facts: VoteFacts | null = null
      if (!isNetworkError(error)) {
        const [open, row, windowRow] = await Promise.all([
          supabase.rpc('voting_is_open'),
          supabase.from('houses').select('id').eq('id', house.id).eq('status', 'approved').maybeSingle(),
          supabase.from('settings').select(CONTEST_SETTINGS_COLUMNS).single<ContestSettings>(),
        ])
        facts = {
          votingOpen: open.error ? null : open.data === true,
          shut: windowRow.data ? windowShut(windowRow.data, new Date()) : null,
          approved: row.error ? null : row.data !== null,
          own: house.submitted_by === latest.current.session?.user.id,
        }
      }
      flash(VOTE.problems[voteProblem(error, facts)])
      refreshSettings()
      refreshHouses()
    },
    [vote, flash, supabase, refreshSettings, refreshHouses],
  )

  // Apply the vote that opened the sign-in, once the session arrives. The account may turn
  // out to own that house, or to have voted for it already, so check before writing.
  // `exclusive` also keeps a re-run of this effect (a new session object from a token
  // refresh mid-flight) from applying the same vote twice.
  useEffect(() => {
    if (!session || !pendingVote) return
    const house = pendingVote
    const own = house.submitted_by === session.user.id
    void exclusive(house.id, async () => {
      try {
        const { votingOpen, settings, now } = latest.current
        if (own) flash(VOTE.problems.own)
        else if (!votingOpen) flash(VOTE.problems[windowShut(settings, now)])
        else {
          const { data } = await supabase.from('votes').select('house_id').maybeSingle<{ house_id: string }>()
          const previous = data?.house_id ?? null
          if (previous === house.id) flash(VOTE.toasts.already(houseName(house)))
          else await submitVote(house, previous)
        }
      } finally {
        setPendingVote(null)
      }
    })
  }, [session, pendingVote, exclusive, submitVote, supabase, flash])

  const castVote = useCallback(
    (house: House) => {
      const { session, myVote, votingOpen } = latest.current
      if (!votingOpen || busy.current) return
      if (!session) {
        setPendingVote(house)
        setAuth({ notice: VOTE.authNotice(houseName(house)) })
        return
      }
      if (house.id === myVote) {
        flash(VOTE.toasts.already(houseName(house)))
        return
      }
      void exclusive(house.id, () => submitVote(house, myVote))
    },
    [flash, exclusive, submitVote],
  )

  // Re-fetch the moment the phase flips (a window boundary passed) instead of waiting
  // out the 30-second poll.
  const phase = settingsLoading ? null : status.phase
  const lastPhase = useRef<Phase | null>(null)
  useEffect(() => {
    const previous = lastPhase.current
    lastPhase.current = phase
    if (previous === null || previous === phase) return
    const t = setTimeout(() => {
      refreshSettings()
      refreshHouses()
      // The reveal arrived while the page was open (the settings poll saw results_visible).
      if (phase === 'results') flash(PODIUM.live)
    }, 0)
    return () => clearTimeout(t)
  }, [phase, refreshSettings, refreshHouses, flash])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    flash(TOASTS.signedOut)
  }, [supabase, flash])

  // "Entries open {day}" only while that day is still ahead: the submissions kill switch can
  // hold the contest in "before" after the stored opening has passed.
  const entriesOpenAt = status.countdown?.kind === 'entries-open' ? status.countdown.target : null
  const tagline = heroTagline(status.phase, {
    submissionsOpenAt: entriesOpenAt,
    submissionsCloseAt: toDate(settings.submissions_close_at),
    votingOpensAt: toDate(settings.voting_opens_at),
    submissionsOpen: status.submissionsOpen,
    votingPaused: status.votingPaused,
  })

  // "Enter your house" while entries are open and this visitor has none; "My entry" once they do.
  const enterCta = status.submissionsOpen && !myEntry
  const heroActions = myEntry ? (
    <RouteLink to="enter" className="btn-ghost">
      {NAV.myEntry}
    </RouteLink>
  ) : enterCta ? (
    <RouteLink to="enter" className="btn-bulb">
      {NAV.enter}
    </RouteLink>
  ) : null
  const waiting = admin.rows?.filter((r) => r.status === 'pending').length ?? 0

  // Lineup ⇄ map (M6). Both callbacks are stable between clock ticks, so the memoized cards
  // and the map don't re-render every second.
  const { geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng } = settings
  const box = useMemo(
    () => geofence({ geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng }),
    [geofence_min_lat, geofence_max_lat, geofence_min_lng, geofence_max_lng],
  )
  // Voting (M7). The vote that counts is the stored one while its house is still approved
  // (M3 D11). Every value the cards depend on is a primitive or a stable callback, so the
  // cards re-render when a vote, the window or the session changes, never on a clock tick.
  const uid = session?.user.id ?? null
  const pick = countedPick(myVote, houses)
  // No vote control until the settings and the visitor's stored vote are known: before
  // that a voter would be offered "Vote for this house" on every card (and a tap would
  // toast "cast" for what is really a switch).
  const ballotPhase = settingsLoading || voteLoading ? null : status.phase
  const { votingOpen, votingPaused } = status
  const opensAt = settings.voting_opens_at
  const ballotFor = useCallback(
    (house: House) =>
      ballotPhase === null
        ? 'none'
        : ballotState({ house, uid, pick, phase: ballotPhase, votingOpen, votingPaused }),
    [ballotPhase, uid, pick, votingOpen, votingPaused],
  )
  const renderBallot = useCallback(
    (house: House) => {
      const state = ballotFor(house)
      if (state === 'none') return null
      const saving = savingId === null ? null : savingId === house.id ? 'this' : 'other'
      return <Ballot house={house} state={state} votingOpen={votingOpen} saving={saving} opensAt={opensAt} onVote={castVote} />
    },
    [ballotFor, savingId, votingOpen, opensAt, castVote],
  )

  // After the reveal: the podium, and a ribbon on each winner's card in the lineup.
  const podium = sample ? samplePodium(houses ?? []) : podiumRows(results, houses)
  // Keyed by a string: useResults hands out a fresh empty list while it loads, and the
  // cards must not re-render every second for that.
  const rankKey = status.phase === 'results' ? podium.map((r) => `${r.id}=${r.rank}`).join(',') : ''
  const ranks = useMemo(
    () => new Map(rankKey ? rankKey.split(',').map((p) => [p.split('=')[0], Number(p.split('=')[1])] as const) : []),
    [rankKey],
  )

  const renderCard = useCallback(
    (house: House) => {
      const isPick = house.id === pick
      const rank = ranks.get(house.id)
      return {
        actions: (
          <>
            {renderBallot(house)}
            <span className="ml-auto">
              <NavigateButton house={house} variant="icon" />
            </span>
          </>
        ),
        // Your pick goes fully lit (M4 D10) and stays lit after the close and the reveal.
        lit: isPick,
        badge:
          isPick || rank ? (
            <span data-slot="house-badges">
              {rank && <span data-slot="house-badge" data-tone="rank">{PODIUM.rankBadge(rank)}</span>}
              {isPick && <span data-slot="house-badge" data-tone="pick">{VOTE.pickBadge}</span>}
            </span>
          ) : undefined,
      }
    },
    [renderBallot, pick, ranks],
  )
  const ownPending = myEntry?.status === 'pending'
  const renderMap = useCallback(
    (ordered: House[]) => (
      <MapView houses={ordered} box={box} ownPending={ownPending} onView={setView} onMessage={flash} renderSheetActions={renderBallot} />
    ),
    [box, ownPending, setView, flash, renderBallot],
  )
  // The house you voted for was hidden by the admin: say so above the lineup and the map.
  const hiddenPick =
    uid !== null && status.phase !== 'results' && pickWasHidden(myVote, houses) ? (
      <Note tone="info">{status.votingOpen ? VOTE.hiddenPick.open : VOTE.hiddenPick.closed}</Note>
    ) : null

  return (
    <>
      <div data-slot="sky" aria-hidden="true" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <Header
          phase={phase}
          preview={previewing}
          paused={status.votingPaused}
          motionOn={motionOn}
          onToggleMotion={toggleMotion}
          actions={
            myEntry && route !== 'enter' ? (
              <RouteLink to="enter" className="header-link">
                {NAV.myEntry}
              </RouteLink>
            ) : null
          }
        />
        {route === 'enter' ? (
          <EntryPage
            session={session}
            ready={sessionReady && !settingsLoading}
            settings={settings}
            status={status}
            now={now}
            entry={myEntry}
            entryFailed={myEntryFailed}
            refreshEntry={refreshMyEntry}
            onChanged={refreshHouses}
            onSignIn={() => setAuth({ notice: ENTER.signInNotice })}
            flash={flash}
          />
        ) : route === 'admin' ? (
          <AdminPage
            session={session}
            sessionReady={sessionReady}
            rows={admin.rows}
            failed={admin.failed}
            setStatus={admin.setStatus}
            refresh={admin.refresh}
            onChanged={refreshHouses}
            onSignIn={() => setAuth({})}
            flash={flash}
          />
        ) : (
          <main className="grow">
            <Hero
              status={status}
              pending={settingsLoading}
              tagline={tagline}
              now={now}
              onSecretTap={onSecretTap}
              actions={heroActions}
            >
              {status.phase === 'results' && (
                <Podium
                  rows={podium}
                  loading={sample ? housesLoading : resultsLoading}
                  sample={sample}
                  motionOn={motionOn}
                  uid={uid}
                  pick={pick}
                />
              )}
            </Hero>
            <Marquee text={TICKER} className="ticker" />
            <Gallery
              houses={houses}
              loading={housesLoading}
              phase={phase}
              submissionsOpenAt={entriesOpenAt}
              onRetry={refreshHouses}
              view={view}
              toolbar={houses && houses.length > 0 ? <ViewToggle view={view} onChange={setView} onPrefetch={prefetchMap} /> : null}
              notice={hiddenPick}
              renderCard={renderCard}
              renderMap={renderMap}
              emptyAction={
                enterCta ? (
                  <RouteLink to="enter" className="btn-bulb">
                    {NAV.enter}
                  </RouteLink>
                ) : null
              }
            />
          </main>
        )}
        <Footer
          phone={session?.user.phone ?? null}
          isAdmin={isAdmin}
          onSignOut={signOut}
          adminLink={
            <RouteLink to="admin" className="inline-flex min-h-11 items-center px-1 font-semibold text-primary underline underline-offset-4">
              {NAV.moderation(waiting)}
            </RouteLink>
          }
        />
      </div>

      {auth && (
        <PhoneAuthDialog
          labels={AUTH_LABELS}
          notice={auth.notice}
          onSuccess={() => {
            setAuth(null)
            // A waiting vote announces itself (the toast after it goes in).
            if (!pendingVote) flash(TOASTS.signedIn)
          }}
          onCancel={() => {
            setAuth(null)
            setPendingVote(null)
          }}
        />
      )}
      <Toaster message={toast} />
    </>
  )
}
