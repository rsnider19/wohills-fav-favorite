import type { ReactNode } from 'react'
import { SupabaseContext, type AnySupabaseClient } from './context'

/** Makes the app's Supabase client available to every @wohills hook and component. */
export function SupabaseProvider({ client, children }: { client: AnySupabaseClient; children: ReactNode }) {
  return <SupabaseContext value={client}>{children}</SupabaseContext>
}
