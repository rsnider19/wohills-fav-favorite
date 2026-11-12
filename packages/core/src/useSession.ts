import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useSupabase } from './useSupabase'

/** Current auth session. `ready` turns true once the stored session has been read. */
export function useSession(): { session: Session | null; ready: boolean } {
  const client = useSupabase()
  const [state, setState] = useState<{ session: Session | null; ready: boolean }>({ session: null, ready: false })
  useEffect(() => {
    let cancelled = false
    client.auth.getSession().then(({ data }) => {
      // An auth event that already arrived is newer than this read; don't overwrite it.
      if (!cancelled) setState((s) => (s.ready ? s : { session: data.session, ready: true }))
    })
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => setState({ session, ready: true }))
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [client])
  return state
}
