/**
 * Rijen zoals ze in de database staan (snake_case), 1-op-1 met de Supabase-tabellen
 * uit README.md. De localStorage-implementatie slaat exact deze vorm op, zodat er bij
 * de overstap naar Supabase niets aan het datamodel verandert.
 */

export interface EntityRow {
  id: string
  user_id: string
  name: string // uniek per gebruiker
  created_at: string
  updated_at: string
}

export interface MortgageRow {
  id: string // uuid, primary key
  user_id: string // uuid → auth.users(id)
  entity_id: string // uuid → entities(id) on delete restrict
  name: string
  mortgage_number: string
  start_date: string // date
  end_date: string | null // date
  notes: string | null
  counterparty_iban: string | null // IBAN geldverstrekker
  archived_at?: string | null // timestamptz; null = actief
  interest_method?: string // 'actual' | 'thirty_360'
  due_day?: number | null // 1–31 bij thirty_360
  created_at: string // timestamptz
  updated_at: string // timestamptz
}

export interface LoanPartRow {
  id: string
  user_id: string
  mortgage_id: string // → mortgages(id) on delete cascade
  name: string
  principal_cents: number // bigint
  agreed_repayment_cents: number // bigint; 0 = aflossingsvrij / niets afgesproken
  created_at: string
  updated_at: string
}

export interface InterestRatePeriodRow {
  id: string
  user_id: string
  mortgage_id: string // → mortgages(id) on delete cascade
  loan_part_id: string // (loan_part_id, mortgage_id) → loan_parts(id, mortgage_id)
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
  description: string | null
  created_at: string
  updated_at: string
}

/** Rente en aflossing van één leningdeel binnen een betaling. */
export interface PaymentLineRow {
  id: string
  user_id: string
  payment_id: string // (payment_id, mortgage_id) → payments(id, mortgage_id) on delete cascade
  mortgage_id: string
  loan_part_id: string // (loan_part_id, mortgage_id) → loan_parts(id, mortgage_id) on delete cascade
  interest_cents: number // bigint
  principal_cents: number // bigint
  created_at: string
}

/** Zoals PostgREST ze teruggeeft met een embedded select. */
export type MortgageWithPartsRow = MortgageRow & { loan_parts: LoanPartRow[] }
export type PaymentWithLinesRow = PaymentRow & { payment_lines: PaymentLineRow[] }

/** Velden die de database zelf vult (default-waarden / triggers). */
type DbGenerated = 'id' | 'user_id' | 'created_at' | 'updated_at'

export type MortgageInsert = Omit<MortgageRow, DbGenerated>
export type LoanPartInsert = Omit<LoanPartRow, DbGenerated>
export type InterestRatePeriodInsert = Omit<InterestRatePeriodRow, DbGenerated>

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

/** Zoals de app ze leest (zonder sessie-gegevens van de bank). */
export interface BankConnectionRow {
  id: string
  entity_id: string
  status: string
  psu_type: string
  aspsp_name: string
  iban: string | null
  account_name: string | null
  valid_until: string | null
  last_synced_at: string | null
  balance_cents: number | null
  balance_date: string | null
  last_error: string | null
  available_accounts: { uid: string; iban: string | null; name: string | null }[] | null
}

export interface BankTransactionRow {
  id: string
  entity_id: string
  connection_id: string
  booking_date: string
  amount_cents: number
  currency: string
  counterparty_name: string | null
  counterparty_iban: string | null
  description: string | null
  payment_id: string | null
  ignored: boolean
}
