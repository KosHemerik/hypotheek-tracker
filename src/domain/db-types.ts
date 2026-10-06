/**
 * Rijen zoals ze in de database staan (snake_case), 1-op-1 met de Supabase-tabellen
 * uit README.md. De localStorage-implementatie slaat exact deze vorm op, zodat er bij
 * de overstap naar Supabase niets aan het datamodel verandert.
 */

export interface MortgageRow {
  id: string // uuid, primary key
  user_id: string // uuid → auth.users(id)
  name: string
  mortgage_number: string
  principal_cents: number // bigint
  start_date: string // date
  end_date: string | null // date
  notes: string | null
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

export interface InterestRatePeriodRow {
  id: string
  user_id: string
  mortgage_id: string // → mortgages(id) on delete cascade
  rate_percentage: number | string // numeric(6,3); PostgREST kan numeric als string teruggeven
  effective_date: string
  created_at: string
  updated_at: string
}

export interface PaymentRow {
  id: string
  user_id: string
  mortgage_id: string // → mortgages(id) on delete cascade
  payment_date: string
  interest_cents: number // bigint
  principal_cents: number // bigint
  description: string | null
  created_at: string
  updated_at: string
}

/** Velden die de database zelf vult (default-waarden / triggers). */
type DbGenerated = 'id' | 'user_id' | 'created_at' | 'updated_at'

export type MortgageInsert = Omit<MortgageRow, DbGenerated>
export type InterestRatePeriodInsert = Omit<InterestRatePeriodRow, DbGenerated>
export type PaymentInsert = Omit<PaymentRow, DbGenerated>

export interface MortgageDocumentRow {
  id: string
  user_id: string
  mortgage_id: string // → mortgages(id) on delete cascade
  file_name: string
  mime_type: string
  size_bytes: number // bigint
  category: string // check-constraint op de toegestane categorieën
  description: string | null
  storage_path: string // pad in de storage-bucket `mortgage-documents`
  created_at: string
  updated_at: string
}
