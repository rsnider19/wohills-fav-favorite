import { describe, expect, it } from 'vitest'
import { ballotState, countedPick, isNetworkError, pickWasHidden, voteProblem, windowShut, type BallotInput } from './ballot'

const HOUSE = { id: 'h4', submitted_by: 'owner-4' }
const ME = 'voter'
const open: Omit<BallotInput, 'house'> = { uid: ME, pick: null, phase: 'voting', votingOpen: true, votingPaused: false }
const state = (over: Partial<BallotInput>) => ballotState({ house: HOUSE, ...open, ...over })

describe('ballotState', () => {
  it('asks a signed-out visitor to sign in while voting is open', () => {
    expect(state({ uid: null })).toBe('sign-in')
  })
  it('offers a vote, then a switch once the pick is another house', () => {
    expect(state({})).toBe('vote')
    expect(state({ pick: 'h2' })).toBe('change')
  })
  it('lights the pick, open or closed', () => {
    expect(state({ pick: 'h4' })).toBe('pick')
    expect(state({ pick: 'h4', phase: 'closed', votingOpen: false })).toBe('pick')
    expect(state({ pick: 'h4', phase: 'closed', votingOpen: false, votingPaused: true })).toBe('pick')
  })
  it('never offers a vote on your own house, in any phase before the reveal', () => {
    for (const phase of ['before', 'submissions', 'voting', 'closed'] as const)
      expect(state({ uid: 'owner-4', phase, votingOpen: phase === 'voting' })).toBe('own')
  })
  it('says "not yet" before voting opens, signed in or not', () => {
    expect(state({ phase: 'submissions', votingOpen: false })).toBe('not-yet')
    expect(state({ phase: 'before', votingOpen: false, uid: null })).toBe('not-yet')
  })
  it('tells a pause from the close', () => {
    expect(state({ phase: 'closed', votingOpen: false, votingPaused: true })).toBe('paused')
    expect(state({ phase: 'closed', votingOpen: false })).toBe('closed')
    expect(state({ phase: 'closed', votingOpen: false, uid: null })).toBe('closed')
  })
  it('shows nothing after the reveal', () => {
    expect(state({ phase: 'results', votingOpen: false })).toBe('none')
    expect(state({ phase: 'results', votingOpen: false, pick: 'h4' })).toBe('none')
    expect(state({ phase: 'results', votingOpen: false, uid: 'owner-4' })).toBe('none')
  })
})

describe('countedPick and pickWasHidden', () => {
  const houses = [{ id: 'h1' }, { id: 'h4' }]
  it('keeps a vote for an approved house', () => {
    expect(countedPick('h4', houses)).toBe('h4')
    expect(pickWasHidden('h4', houses)).toBe(false)
  })
  it('drops a vote for a house that is no longer approved (kept, not counted: M3 D11)', () => {
    expect(countedPick('h8', houses)).toBeNull()
    expect(pickWasHidden('h8', houses)).toBe(true)
  })
  it('trusts the stored vote until the houses have loaded', () => {
    expect(countedPick('h8', undefined)).toBe('h8')
    expect(pickWasHidden('h8', undefined)).toBe(false)
  })
  it('has nothing to say without a vote', () => {
    expect(countedPick(null, houses)).toBeNull()
    expect(pickWasHidden(null, houses)).toBe(false)
  })
})

describe('voteProblem', () => {
  const rls = { code: '42501', message: 'new row violates row-level security policy for table "votes"' }
  const facts = { votingOpen: true, shut: null, approved: true, own: false }
  it('spots a dropped connection without asking the database', () => {
    expect(isNetworkError({ code: '', message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(voteProblem({ code: '', message: 'TypeError: Failed to fetch' }, null)).toBe('network')
    expect(isNetworkError(rls)).toBe(false)
  })
  it('explains an RLS refusal from what changed', () => {
    expect(voteProblem(rls, { ...facts, votingOpen: false, shut: 'closed' })).toBe('closed')
    expect(voteProblem(rls, { ...facts, votingOpen: false, shut: 'paused' })).toBe('paused')
    expect(voteProblem(rls, { ...facts, votingOpen: false, shut: 'not-yet' })).toBe('not-yet')
    // The settings couldn't be read: the window edge is the likeliest reason.
    expect(voteProblem(rls, { ...facts, votingOpen: false, shut: null })).toBe('closed')
    expect(voteProblem(rls, { ...facts, approved: false })).toBe('gone')
    expect(voteProblem(rls, { ...facts, own: true })).toBe('own')
  })
  it('falls back to "unknown" when nothing explains it', () => {
    expect(voteProblem(rls, facts)).toBe('unknown')
    expect(voteProblem(rls, { votingOpen: null, shut: null, approved: null, own: false })).toBe('unknown')
    expect(voteProblem(rls, null)).toBe('unknown')
    expect(voteProblem({ code: '23505', message: 'duplicate key' }, { ...facts, votingOpen: false })).toBe('unknown')
  })
})

describe('windowShut', () => {
  // The decided window: Dec 8 00:00 to Dec 21 00:00 America/New_York (05:00Z).
  const s = { voting_open: true, results_visible: false, voting_opens_at: '2026-12-08T05:00:00Z', voting_closes_at: '2026-12-21T05:00:00Z' }
  it('tells "not yet" from "closed" at the window edges, to the second', () => {
    expect(windowShut(s, new Date('2026-12-08T04:59:59Z'))).toBe('not-yet')
    expect(windowShut(s, new Date('2026-12-21T05:00:00Z'))).toBe('closed')
  })
  it('says "paused" only inside the window with the kill switch off', () => {
    const off = { ...s, voting_open: false }
    expect(windowShut(off, new Date('2026-12-10T12:00:00Z'))).toBe('paused')
    expect(windowShut(off, new Date('2026-12-08T04:59:59Z'))).toBe('not-yet')
    expect(windowShut(off, new Date('2026-12-21T05:00:00Z'))).toBe('closed')
  })
  it('reads a clock that still says "open" as the window edge (the database said shut)', () => {
    expect(windowShut(s, new Date('2026-12-20T04:59:59Z'))).toBe('closed')
  })
})
