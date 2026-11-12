import type { ContestSettings } from './types'
import { usePolling } from './usePolling'
import { useSupabase } from './useSupabase'

export const CONTEST_SETTINGS_COLUMNS = 'voting_open, results_visible, voting_opens_at, voting_closes_at'

/** What the UI assumes before the first load (matches the parade's original default). */
export const DEFAULT_CONTEST_SETTINGS: ContestSettings = {
  voting_open: true,
  results_visible: false,
  voting_opens_at: null,
  voting_closes_at: null,
}

/** Polls the single-row `settings` table of the client's schema. When S adds
 *  columns (lights), pass both `columns` and `initial`. */
export function useContestSettings<S extends ContestSettings = ContestSettings>(
  options: { columns?: string; initial?: S; intervalMs?: number } = {},
): { settings: S; loading: boolean; refresh: () => Promise<void> } {
  const { columns = CONTEST_SETTINGS_COLUMNS, initial, intervalMs } = options
  const client = useSupabase()
  const { data, loading, refresh } = usePolling(
    async () => (await client.from('settings').select(columns).single<S>()).data,
    { intervalMs },
  )
  return { settings: data ?? initial ?? (DEFAULT_CONTEST_SETTINGS as S), loading, refresh }
}
