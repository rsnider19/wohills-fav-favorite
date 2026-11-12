import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useSupabase } from './useSupabase'

/** Whether the signed-in phone is the contest admin. Always asks public.is_admin(),
 *  which both contests share, even from a client whose default schema is `lights`. */
export function useIsAdmin(session: Session | null): boolean {
  const client = useSupabase()
  const userId = session?.user.id ?? null
  const [result, setResult] = useState<{ userId: string; admin: boolean } | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    client
      .schema('public')
      .rpc('is_admin')
      .then(({ data }) => {
        if (!cancelled) setResult({ userId, admin: data === true })
      })
    return () => {
      cancelled = true
    }
  }, [client, userId])
  return userId !== null && result?.userId === userId && result.admin
}
