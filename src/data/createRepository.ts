import type { SupabaseClient } from '@supabase/supabase-js'
import { LocalStorageMortgageRepository } from './LocalStorageMortgageRepository'
import type { MortgageRepository } from './MortgageRepository'
import { SupabaseMortgageRepository } from './SupabaseMortgageRepository'

/**
 * Het enige punt waar gekozen wordt welke opslag de app gebruikt.
 *
 * - Ingelogd via Supabase: `SupabaseMortgageRepository` met de client van de sessie
 *   (RLS zorgt dat je alleen je eigen data ziet).
 * - Zonder Supabase-configuratie (lokaal ontwikkelen): localStorage + IndexedDB.
 */
export function createRepository(client: SupabaseClient | null): MortgageRepository {
  return client ? new SupabaseMortgageRepository(client) : new LocalStorageMortgageRepository()
}
