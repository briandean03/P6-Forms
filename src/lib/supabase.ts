import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const supabaseReady = /^https?:\/\/.+/.test(supabaseUrl) && supabaseAnonKey.length > 0

// Created lazily so a missing/bad configuration cannot crash the whole app at
// module load (which rendered a blank page). Code touching `supabase` checks
// `supabaseReady` and shows a friendly message instead.
export const supabase = createClient<Database>(
  supabaseReady ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseReady ? supabaseAnonKey : 'public-anon-key-placeholder',
)

export { supabaseReady }

// Returns a schema-scoped client for project-specific schemas (e.g. 'atgc').
// Falls back to the default public client when schema is 'public' or empty.
// NOTE: any non-public schema must be added to the "Extra schemas" list in
// your Supabase project's API settings before this will work.
export function schemaClient(schema: string) {
  if (!schema || schema === 'public') return supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).schema(schema) as typeof supabase
}
