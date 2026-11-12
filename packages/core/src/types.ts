/** Columns every contest's settings row shares (parade: public.settings,
 *  lights: lights.settings). Windows are enforced by RLS; these drive the UI. */
export interface ContestSettings {
  voting_open: boolean
  results_visible: boolean
  /** ISO timestamps; null means no restriction on that side. */
  voting_opens_at: string | null
  voting_closes_at: string | null
}
