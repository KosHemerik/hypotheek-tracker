import { LocalStorageMortgageRepository } from './LocalStorageMortgageRepository'
import type { MortgageRepository } from './MortgageRepository'

/**
 * Het enige punt waar gekozen wordt welke opslag de app gebruikt.
 *
 * - Zonder env-variabelen: localStorage (standaard).
 * - Met `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`: Supabase. De Supabase-code wordt
 *   dan pas geladen (dynamic import), zodat hij de bundel niet vergroot zolang je hem
 *   niet gebruikt. Zie README voor de stappen (o.a. inloggen, nodig voor RLS).
 */
export async function createRepository(): Promise<MortgageRepository> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (url && anonKey) {
    const [{ createClient }, { SupabaseMortgageRepository }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('./SupabaseMortgageRepository'),
    ])
    return new SupabaseMortgageRepository(createClient(url, anonKey))
  }
  return new LocalStorageMortgageRepository()
}
