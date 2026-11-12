import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { LightsSettings } from './types'
import {
  contestStatus,
  type Phase,
  DEFAULT_LIGHTS_SETTINGS,
  LIGHTS_SETTINGS_COLUMNS,
  parsePreview,
  previewSettings,
} from './lib/phase'
import { useApprovedHouses } from './lib/houses'
import { useMotion } from './lib/useMotion'
import { AUTH_LABELS, heroTagline, TICKER, TOASTS } from './copy'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Gallery } from './components/Gallery'
import { Footer } from './components/Footer'

const toDate = (iso: string | null) => (iso ? new Date(iso) : null)

export default function App() {
  const supabase = useSupabase()
  const { session } = useSession()
  const now = useNow()
  const isAdmin = useIsAdmin(session)
  const { toast, flash } = useToast()
  const { motionOn, toggleMotion } = useMotion()
  const {
    settings: liveSettings,
    loading: settingsLoading,
    refresh: refreshSettings,
  } = useContestSettings<LightsSettings>({ columns: LIGHTS_SETTINGS_COLUMNS, initial: DEFAULT_LIGHTS_SETTINGS })
  const { data: houses, loading: housesLoading, refresh: refreshHouses } = useApprovedHouses()

  // ?preview=<phase> shows another phase's look without touching the database:
  // always in `npm run dev`, and for the signed-in admin on a real build. Display only:
  // the database still enforces the real windows.
  const [preview] = useState(() => parsePreview(window.location.search))
  const [previewAnchor] = useState(() => new Date())
  const previewing = preview !== null && (import.meta.env.DEV || isAdmin)
  const settings = previewing ? previewSettings(preview, previewAnchor, liveSettings) : liveSettings
  const status = settingsLoading ? null : contestStatus(settings, now)

  // Hidden sign-in for the admin before anything opens: /?signin or 5 taps on the hero eyebrow.
  const [showAuth, setShowAuth] = useState(() => new URLSearchParams(window.location.search).has('signin'))
  const onSecretTap = useSecretTaps(() => setShowAuth(true))

  // Re-fetch the moment the phase flips (a window boundary passed) instead of waiting
  // out the 30-second poll.
  const phase = status?.phase ?? null
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

  const tagline = status
    ? heroTagline(status.phase, {
        submissionsOpenAt: toDate(settings.submissions_open_at),
        submissionsCloseAt: toDate(settings.submissions_close_at),
        votingOpensAt: toDate(settings.voting_opens_at),
        submissionsOpen: status.submissionsOpen,
      })
    : null

  return (
    <>
      <div data-slot="sky" aria-hidden="true" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <Header
          phase={phase}
          preview={previewing}
          motionOn={motionOn}
          onToggleMotion={toggleMotion}
        />
        <main className="grow">
          <Hero status={status} tagline={tagline} now={now} onSecretTap={onSecretTap} />
          <Marquee text={TICKER} className="ticker" />
          <Gallery
            houses={houses}
            loading={housesLoading}
            phase={phase}
            submissionsOpenAt={toDate(settings.submissions_open_at)}
            onRetry={refreshHouses}
          />
        </main>
        <Footer phone={session?.user.phone ?? null} isAdmin={isAdmin} onSignOut={signOut} />
      </div>

      {showAuth && (
        <PhoneAuthDialog
          labels={AUTH_LABELS}
          onSuccess={() => {
            setShowAuth(false)
            flash(TOASTS.signedIn)
          }}
          onCancel={() => setShowAuth(false)}
        />
      )}
      <Toaster message={toast} />
    </>
  )
}
