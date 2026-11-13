import { usePolling } from './usePolling'
import { useSupabase } from './useSupabase'

/** Polls the reveal RPC while `enabled` (i.e. results_visible). The SQL function
 *  itself returns nothing until the reveal and at most the top 3 rows. `loading`
 *  tells "not answered yet" apart from "no rows", e.g. to hold a reveal animation:
 *  a failed call is not an answer, so `loading` stays true until the database has
 *  answered once, and a later failure keeps the last rows. */
export function useResults<R>(
  enabled: boolean,
  { fn = 'get_results', intervalMs }: { fn?: string; intervalMs?: number } = {},
): { results: R[]; loading: boolean; refresh: () => Promise<void> } {
  const client = useSupabase()
  const { data, refresh } = usePolling(
    async () => {
      const { data, error } = await client.rpc(fn)
      // Throwing keeps the last rows (usePolling logs it and moves on).
      if (error) throw error
      return (data ?? []) as R[]
    },
    { intervalMs, enabled },
  )
  return { results: enabled ? (data ?? []) : [], loading: enabled && data === undefined, refresh }
}
