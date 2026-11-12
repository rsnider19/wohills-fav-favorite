import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy apps/lights/.env.example to apps/lights/.env and fill in values from `supabase status`.',
  )
}

// Same project as the parade; every table and function name resolves in the `lights`
// schema. useIsAdmin() reaches public.is_admin() through client.schema('public').
export const supabase = createClient(url, anonKey, { db: { schema: 'lights' } })
