import { describe, expect, it } from 'vitest'
import { votingWindow } from './useVotingWindow'

const base = { voting_open: true, results_visible: false, voting_opens_at: '2026-12-08T05:00:00Z', voting_closes_at: '2026-12-21T05:00:00Z' }
const at = (iso: string) => new Date(iso)

describe('votingWindow', () => {
  it('before open', () =>
    expect(votingWindow(base, at('2026-12-01T00:00:00Z'))).toMatchObject({ beforeOpen: true, afterClose: false, votingOpen: false }))
  it('open', () =>
    expect(votingWindow(base, at('2026-12-10T00:00:00Z'))).toMatchObject({ beforeOpen: false, afterClose: false, votingOpen: true }))
  it('closes exactly at voting_closes_at', () =>
    expect(votingWindow(base, at('2026-12-21T05:00:00Z'))).toMatchObject({ afterClose: true, votingOpen: false }))
  it('kill switch', () =>
    expect(votingWindow({ ...base, voting_open: false }, at('2026-12-10T00:00:00Z')).votingOpen).toBe(false))
  it('null bounds mean no restriction', () =>
    expect(votingWindow({ ...base, voting_opens_at: null, voting_closes_at: null }, at('2030-01-01T00:00:00Z')).votingOpen).toBe(true))
  it('admin preview overrides the clock and the kill switch', () => {
    const closed = { ...base, voting_open: false }
    expect(votingWindow(closed, at('2026-12-30T00:00:00Z'), 'live')).toMatchObject({ beforeOpen: false, afterClose: false, votingOpen: true })
    expect(votingWindow(base, at('2026-12-10T00:00:00Z'), 'prevote')).toMatchObject({ beforeOpen: true, afterClose: false, votingOpen: false })
  })
})
