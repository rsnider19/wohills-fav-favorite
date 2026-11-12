import { describe, expect, it } from 'vitest'
import { PODIUM, VOTE } from './copy'

// The contest runs on America/New_York (plan §7) whatever the visitor's or the build
// machine's time zone: Intl is given the zone explicitly, so these hold under any TZ.
describe('vote copy (M7)', () => {
  it('names the opening day in Eastern time, right at the window edge', () => {
    // Dec 8 00:00 EST = 05:00Z. A formatter in the visitor's zone would say "Mon, Dec 7"
    // west of New York.
    expect(VOTE.notYet(new Date('2026-12-08T05:00:00Z'))).toBe('Voting opens Tue, Dec 8')
    expect(VOTE.notYet(new Date('2026-12-08T04:59:59Z'))).toBe('Voting opens Mon, Dec 7')
    expect(VOTE.notYet(null)).toBe('Voting opens soon')
  })

  it('has a refusal message for every reason a vote can be turned down', () => {
    for (const reason of ['closed', 'paused', 'not-yet', 'gone', 'own', 'network', 'unknown'] as const)
      expect(VOTE.problems[reason], reason).toMatch(/\S/)
    // A pause is not the close: the paused copy must not say "closed".
    expect(VOTE.problems.paused).not.toMatch(/closed/i)
  })

  it('counts votes in the singular only for one', () => {
    expect(PODIUM.votesUnit(1)).toBe('vote')
    expect([0, 2, null].map(PODIUM.votesUnit)).toEqual(['votes', 'votes', 'votes'])
  })
})
