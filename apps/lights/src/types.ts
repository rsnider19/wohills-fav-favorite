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
  /** [lat, lng] vertices (open or closed ring), or null for the box alone. */
  geofence_polygon: [number, number][] | null
}

export type HouseStatus = 'pending' | 'approved' | 'hidden'

/** A house with its moderation fields: the owner's own entry ("My entry") and every row
 *  of the admin's queue. Only the owner and the admin can read non-approved rows (M3 D9). */
export interface EntryRow extends House {
  status: HouseStatus
  created_at: string
  updated_at: string
}
