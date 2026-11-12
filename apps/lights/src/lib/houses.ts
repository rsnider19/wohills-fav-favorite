import { usePolling, useSupabase, type Polling } from '@wohills/core'
import type { House } from '../types'

export const HOUSE_COLUMNS = 'id, entry_number, title, address, lat, lng, photo_url, submitted_by'

/** Approved houses, polled every 30s so newly approved entries appear without a reload.
 *  Always filter on status: the admin's select policy returns every house (M3 D9). */
export function useApprovedHouses(): Polling<House[]> {
  const client = useSupabase()
  return usePolling(async () => {
    const { data, error } = await client
      .from('houses')
      .select(HOUSE_COLUMNS)
      .eq('status', 'approved')
      .order('entry_number')
    // Throwing keeps the last good list on screen (usePolling logs and moves on).
    if (error) throw error
    return data as House[]
  })
}
