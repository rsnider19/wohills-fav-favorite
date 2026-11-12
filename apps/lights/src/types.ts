import type { ContestSettings } from '@wohills/core'

/** One approved row of lights.houses, as the gallery reads it (see M3 "Notes for later milestones"). */
export interface House {
  id: string
  entry_number: number
  /** Optional display name; the card falls back to the address. */
  title: string | null
  address: string
  lat: number
  lng: number
  photo_url: string
  /** Opaque auth uuid of the owner (M7 shows "Your house" instead of a vote button). */
  submitted_by: string
}

/** lights.settings: the shared contract columns plus the submission window and geofence. */
export interface LightsSettings extends ContestSettings {
  submissions_open: boolean
  submissions_open_at: string | null
  submissions_close_at: string | null
  geofence_min_lat: number
  geofence_max_lat: number
  geofence_min_lng: number
  geofence_max_lng: number
}
