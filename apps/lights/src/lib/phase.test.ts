import { describe, expect, it } from 'vitest'
import { contestStatus, DEFAULT_LIGHTS_SETTINGS, parsePreview, PHASES, previewSettings } from './phase'
import type { LightsSettings } from '../types'

const NOW = new Date('2026-12-01T17:00:00Z')
const base = DEFAULT_LIGHTS_SETTINGS
const s = (over: Partial<LightsSettings>): LightsSettings => ({ ...base, ...over })

describe('contestStatus', () => {
  it('is "before" ahead of the submission window and counts down to entries', () => {
    const st = contestStatus(base, new Date('2026-11-20T12:00:00Z'))
    expect(st.phase).toBe('before')
    expect(st.submissionsOpen).toBe(false)
    expect(st.countdown).toEqual({ kind: 'entries-open', target: new Date('2026-11-28T05:00:00Z') })
  })

  it('is "submissions" once entries open, counting down to voting, with owner edits allowed', () => {
    const st = contestStatus(base, NOW)
    expect(st).toMatchObject({ phase: 'submissions', submissionsOpen: true, ownerCanEdit: true, votingOpen: false })
    expect(st.countdown).toEqual({ kind: 'voting-opens', target: new Date('2026-12-08T05:00:00Z') })
  })

  it('is "voting" in the overlap: late entries still open, owner edits locked', () => {
    const st = contestStatus(base, new Date('2026-12-10T12:00:00Z'))
    expect(st).toMatchObject({ phase: 'voting', submissionsOpen: true, ownerCanEdit: false, votingOpen: true })
    expect(st.countdown).toEqual({ kind: 'voting-closes', target: new Date('2026-12-21T05:00:00Z') })
  })

  it('is "closed" after the close and while paused inside the window, with no countdown', () => {
    expect(contestStatus(base, new Date('2026-12-22T12:00:00Z'))).toMatchObject({ phase: 'closed', countdown: null })
    expect(contestStatus(s({ voting_open: false }), new Date('2026-12-10T12:00:00Z')).phase).toBe('closed')
  })

  it('is "results" whenever results are visible', () => {
    expect(contestStatus(s({ results_visible: true }), NOW)).toMatchObject({ phase: 'results', countdown: null })
  })

  it('honours the submissions kill switch', () => {
    const st = contestStatus(s({ submissions_open: false }), NOW)
    expect(st).toMatchObject({ phase: 'before', submissionsOpen: false, ownerCanEdit: false })
    expect(st.countdown?.kind).toBe('voting-opens')
  })

  it('treats a null voting_opens_at as "voting unrestricted", so owners are locked (M3 D5)', () => {
    const st = contestStatus(s({ voting_opens_at: null }), NOW)
    expect(st).toMatchObject({ phase: 'voting', ownerCanEdit: false })
  })
})

describe('previewSettings', () => {
  it('puts the anchor inside every phase', () => {
    for (const phase of PHASES) expect(contestStatus(previewSettings(phase, NOW, base), NOW).phase).toBe(phase)
  })

  it('keeps the real submission and voting dates wherever they fit the phase', () => {
    const voting = previewSettings('voting', NOW, base)
    // The decided windows: submissions run through Dec 15, voting closes Dec 21 (ET).
    expect(voting.submissions_close_at).toBe(base.submissions_close_at)
    expect(voting.voting_closes_at).toBe(base.voting_closes_at)
    // Weeks ahead of the contest, "before" keeps every real date (Nov 28 opening included).
    const early = previewSettings('before', new Date('2026-11-12T17:00:00Z'), base)
    expect(early.submissions_open_at).toBe(base.submissions_open_at)
    expect(early.voting_opens_at).toBe(base.voting_opens_at)
    const subs = previewSettings('submissions', NOW, base)
    expect(subs.voting_opens_at).toBe(base.voting_opens_at)
    expect(subs.submissions_close_at).toBe(base.submissions_close_at)
  })

  it('never yields an out-of-order window or a different status, whatever the anchor', () => {
    const inOrder = (a: string | null, b: string | null) => !a || !b || Date.parse(a) < Date.parse(b)
    for (let day = 0; day < 75; day++) {
      // Nov 1 2026 to mid-January, half past every hour of the day in turn.
      const anchor = new Date(Date.UTC(2026, 10, 1 + day, day % 24, 30))
      for (const phase of PHASES) {
        const p = previewSettings(phase, anchor, base)
        const label = `${phase} at ${anchor.toISOString()}`
        expect(inOrder(p.submissions_open_at, p.submissions_close_at), label).toBe(true)
        expect(inOrder(p.voting_opens_at, p.voting_closes_at), label).toBe(true)
        const st = contestStatus(p, anchor)
        expect(st.phase, label).toBe(phase)
        expect(st.submissionsOpen, label).toBe(phase === 'submissions' || phase === 'voting')
        expect(st.votingOpen, label).toBe(phase === 'voting')
      }
    }
  })

  it('keeps the geofence', () => {
    expect(previewSettings('voting', NOW, base).geofence_max_lat).toBe(base.geofence_max_lat)
  })
})

describe('parsePreview', () => {
  it('accepts known phases only', () => {
    expect(parsePreview('?preview=voting')).toBe('voting')
    expect(parsePreview('?preview=nope')).toBeNull()
    expect(parsePreview('')).toBeNull()
  })
})
