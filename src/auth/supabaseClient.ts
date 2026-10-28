import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Zonder deze env-variabelen draait de app lokaal (localStorage, zonder login). */
export const isSupabaseConfigured = Boolean(url && anonKey)

let client: Promise<SupabaseClient> | null = null

/**
 * Eén gedeelde client voor auth én data. De sessie wordt door supabase-js in
 * localStorage bewaard en automatisch ververst. De library wordt pas geladen als
 * Supabase geconfigureerd is.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!url || !anonKey) throw new Error('Supabase is niet geconfigureerd.')
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Alleen e-mail + wachtwoord; geen magic links of OAuth-redirects.
        detectSessionInUrl: false,
      },
    }),
  )
  return client
}
