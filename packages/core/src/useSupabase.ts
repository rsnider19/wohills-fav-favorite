import { use } from 'react'
import { SupabaseContext, type AnySupabaseClient } from './context'

export function useSupabase<C extends AnySupabaseClient = AnySupabaseClient>(): C {
  const client = use(SupabaseContext)
  if (!client) throw new Error('useSupabase() needs a <SupabaseProvider> above it')
  return client as C
}
