export interface Entry {
  id: string
  entry_number: number
  theme: string
  street: string
  description: string | null
  emoji: string
  image_url: string | null
}

/** One row of public.get_results() (top 3 once results_visible is set). */
export interface ResultRow {
  entry_id: string
  entry_number: number
  theme: string
  street: string
  emoji: string
  image_url: string | null
  vote_count: number
}
