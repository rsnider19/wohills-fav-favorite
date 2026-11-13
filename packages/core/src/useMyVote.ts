import { useCallback, useEffect, useRef, useState } from 'react'
import type { PostgrestError, Session } from '@supabase/supabase-js'
import { useSupabase } from './useSupabase'

export interface MyVoteOptions {
  /** Column holding the voted-for id: 'entry_id' (parade) or 'house_id' (lights). */
  column: string
  /** Default 'votes' (resolved in the client's schema). */
  table?: string
  /** Skip fetching while true, e.g. while a vote chosen before sign-in is still being applied. */
  paused?: boolean
}

/** The signed-in user's current vote, plus `vote()` to cast or change it. */
export function useMyVote(
  session: Session | null,
  { column, table = 'votes', paused = false }: MyVoteOptions,
): {
  myVote: string | null
  /** True while signed in and this user's stored vote hasn't been read yet (never while
   *  `paused`). Until then `myVote` is null even if the user has voted, so an app can hold
   *  its vote controls instead of offering "Vote" to someone who already has. */
  loading: boolean
  vote: (targetId: string) => Promise<{ error: PostgrestError | null }>
} {
  const client = useSupabase()
  const userId = session?.user.id ?? null
  // Tagged with the user it belongs to, so a sign-out or account switch never shows a stale pick.
  const [fetched, setFetched] = useState<{ userId: string; id: string | null } | null>(null)
  // The user whose read has finished, answered or not: a failed read ends the wait too
  // (the database still decides; only the label could be off).
  const [settledFor, setSettledFor] = useState<string | null>(null)
  // Bumped by every successful vote(), so a read that was already in flight
  // can't put the previous pick back on screen.
  const votes = useRef(0)

  useEffect(() => {
    if (!userId || paused) return
    let cancelled = false
    const votesAtStart = votes.current
    client
      .from(table)
      .select(column)
      .maybeSingle<Record<string, string | null>>()
      .then(({ data, error }) => {
        if (cancelled) return
        setSettledFor(userId)
        // On an error keep what we have (e.g. the vote just cast) instead of showing "no vote".
        if (error || votes.current !== votesAtStart) return
        setFetched({ userId, id: data?.[column] ?? null })
      })
    return () => {
      cancelled = true
    }
  }, [client, table, column, userId, paused])

  const vote = useCallback(
    async (targetId: string) => {
      if (!userId) throw new Error('vote() needs a signed-in session')
      // The PK on votes.user_id makes this an insert-or-change-my-vote, never a second vote.
      const { error } = await client
        .from(table)
        .upsert({ user_id: userId, [column]: targetId }, { onConflict: 'user_id' })
      if (!error) {
        votes.current += 1
        setFetched({ userId, id: targetId })
      }
      return { error }
    },
    [client, table, column, userId],
  )

  const known = fetched?.userId === userId
  const myVote = userId && known ? fetched.id : null
  const loading = userId !== null && !paused && !known && settledFor !== userId
  return { myVote, loading, vote }
}
