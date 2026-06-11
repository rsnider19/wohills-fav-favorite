export interface Entry {
  id: string
  entry_number: number
  theme: string
  street: string
  description: string | null
  emoji: string
  image_url: string | null
}

export interface Settings {
  voting_open: boolean
  results_visible: boolean
  /** ISO timestamps; null means no restriction on that side. Enforced by RLS. */
  voting_opens_at: string | null
  voting_closes_at: string | null
}

export interface ResultRow {
  entry_id: string
  entry_number: number
  theme: string
  street: string
  emoji: string
  image_url: string | null
  vote_count: number
}
