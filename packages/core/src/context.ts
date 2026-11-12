import { createContext } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// Any schema, any generated Database type: parade passes a `public` client,
// lights a client created with { db: { schema: 'lights' } }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabaseClient = SupabaseClient<any, any, any>

export const SupabaseContext = createContext<AnySupabaseClient | null>(null)
