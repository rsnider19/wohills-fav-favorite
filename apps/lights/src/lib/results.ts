import { usePolling, useSupabase } from '@wohills/core'
import type { LightsResult } from './reveal'

/** lights.get_results() while `revealed` (the live results_visible), polled like core's
 *  useResults. The difference: a failed call is not an empty answer. core's hook turns an
 *  error into `[]`, which the podium would read as "No votes were cast" on reveal night
 *  whenever a phone's first request drops; here `loading` stays true ("Counting the
 *  votes…") until the database has answered once, and later failures keep the last rows. */
export function useLightsResults(revealed: boolean): { results: LightsResult[]; loading: boolean } {
  const client = useSupabase()
  const { data } = usePolling(
    async () => {
      const { data, error } = await client.rpc('get_results')
      // Throwing keeps `data` as it was (usePolling logs and moves on).
      if (error) throw error
      return (data ?? []) as LightsResult[]
    },
    { enabled: revealed },
  )
  return { results: revealed ? (data ?? []) : [], loading: revealed && data === undefined }
}
