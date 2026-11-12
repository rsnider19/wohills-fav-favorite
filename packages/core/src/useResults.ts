import { usePolling } from './usePolling'
import { useSupabase } from './useSupabase'

/** Polls the reveal RPC while `enabled` (i.e. results_visible). The SQL function
 *  itself returns nothing until the reveal and at most the top 3 rows. */
export function useResults<R>(
  enabled: boolean,
  { fn = 'get_results', intervalMs }: { fn?: string; intervalMs?: number } = {},
): { results: R[]; refresh: () => Promise<void> } {
  const client = useSupabase()
  const { data, refresh } = usePolling(async () => (await client.rpc(fn)).data as R[] | null, {
    intervalMs,
    enabled,
  })
  return { results: enabled ? (data ?? []) : [], refresh }
}
