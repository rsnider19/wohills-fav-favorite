import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  useContestSettings,
  useIsAdmin,
  useNow,
  useSecretTaps,
  useSession,
  useSupabase,
  useToast,
} from '@wohills/core'
import { Marquee, PhoneAuthDialog, Toaster } from '@wohills/ui'
import type { House, LightsSettings } from './types'
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
import { AUTH_LABELS, ENTER, heroTagline, NAV, TICKER, TOASTS } from './copy'
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
    }, 0)
    return () => clearTimeout(t)
  }, [phase, refreshSettings, refreshHouses])

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
  const renderCard = useCallback(
    (house: House) => ({
      actions: (
        <span className="ml-auto">
          <NavigateButton house={house} variant="icon" />
        </span>
      ),
    }),
    [],
  )
  const ownPending = myEntry?.status === 'pending'
  const renderMap = useCallback(
    (ordered: House[]) => <MapView houses={ordered} box={box} ownPending={ownPending} onView={setView} onMessage={flash} />,
    [box, ownPending, setView, flash],
  )

  return (
    <>
      <div data-slot="sky" aria-hidden="true" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <Header
          phase={phase}
          preview={previewing}
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
            />
            <Marquee text={TICKER} className="ticker" />
            <Gallery
              houses={houses}
              loading={housesLoading}
              phase={phase}
              submissionsOpenAt={entriesOpenAt}
              onRetry={refreshHouses}
              view={view}
              toolbar={houses && houses.length > 0 ? <ViewToggle view={view} onChange={setView} onPrefetch={prefetchMap} /> : null}
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
            flash(TOASTS.signedIn)
          }}
          onCancel={() => setAuth(null)}
        />
      )}
      <Toaster message={toast} />
    </>
  )
}
