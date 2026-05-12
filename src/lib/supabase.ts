import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Returns a schema-scoped client for project-specific schemas (e.g. 'atgc').
// Falls back to the default public client when schema is 'public' or empty.
// NOTE: any non-public schema must be added to the "Extra schemas" list in
// your Supabase project's API settings before this will work.
export function schemaClient(schema: string) {
  if (!schema || schema === 'public') return supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).schema(schema) as typeof supabase
}
