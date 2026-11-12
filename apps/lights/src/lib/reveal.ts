import type { House } from '../types'

/** One row of lights.get_results() (M3 D12): nothing before the reveal, then at most the
 *  top 3 approved houses, ranked by votes with the earlier entry first on a tie. */
export interface LightsResult {
  house_id: string
  entry_number: number
  title: string | null
  address: string
  photo_url: string
  vote_count: number
  rank: number
}

/** A house on the podium. `votes` is null on the admin's sample podium (no real counts). */
export interface PodiumRow {
  id: string
  rank: number
  entryNumber: number
  title: string | null
  address: string
  photoUrl: string
  votes: number | null
  /** Another house on the podium has the same count (the SQL put the earlier entry first). */
  tied: boolean
  /** The approved house, for directions and "Your house" (get_results has no lat/lng). */
  house: House | null
}

/** Pure: the podium from get_results(). Houses with no votes aren't winners, so they are
 *  left off (a podium of 0-vote houses would be ranked by entry number alone). */
export function podiumRows(results: LightsResult[], houses: House[] | undefined): PodiumRow[] {
  const rows = results
    .filter((r) => Number(r.vote_count) > 0)
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .slice(0, 3)
  return rows.map((r) => ({
    id: r.house_id,
    rank: Number(r.rank),
    entryNumber: r.entry_number,
    title: r.title,
    address: r.address,
    photoUrl: r.photo_url,
    votes: Number(r.vote_count),
    tied: rows.some((o) => o !== r && Number(o.vote_count) === Number(r.vote_count)),
    house: houses?.find((h) => h.id === r.house_id) ?? null,
  }))
}

/** Pure: the admin's preview podium before the reveal (?preview=results). get_results()
 *  returns nothing until results_visible (even for the admin, M3 lights_30), so this uses
 *  the first three approved houses by entry number, with no counts: nothing real leaks. */
export function samplePodium(houses: House[]): PodiumRow[] {
  return [...houses]
    .sort((a, b) => a.entry_number - b.entry_number)
    .slice(0, 3)
    .map((h, i) => ({
      id: h.id,
      rank: i + 1,
      entryNumber: h.entry_number,
      title: h.title,
      address: h.address,
      photoUrl: h.photo_url,
      votes: null,
      tied: false,
      house: h,
    }))
}

/** Pure: identifies this podium. The reveal plays once per browser per podium; if the
 *  admin changes it after the reveal (hides a winner), it plays again. */
export const revealKey = (rows: PodiumRow[]) => rows.map((r) => `${r.id}:${r.votes ?? '?'}`).join(',')

const SEEN = 'lights-reveal-seen'

/** Whether this browser already watched the reveal of this podium. */
export function seenReveal(key: string): boolean {
  try {
    return localStorage.getItem(SEEN) === key
  } catch {
    return false // storage blocked (private mode): play it, then show the lit podium
  }
}

export function markRevealSeen(key: string) {
  try {
    localStorage.setItem(SEEN, key)
  } catch {
    // Private mode: it plays again next visit, which is harmless.
  }
}

/** The "power surge", in ms (effects.css section 15 holds the same numbers). The page
 *  dims, then No. 3, No. 2 and No. 1 come on one after another with a brownout flicker,
 *  then the power comes back. `surge` is when each place starts. */
export const REVEAL = {
  total: 7000,
  surge: { 3: 900, 2: 2500, 1: 4100 } as Record<number, number>,
}
