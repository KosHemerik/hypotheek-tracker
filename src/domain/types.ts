/**
 * Domeintypes zoals de UI en de berekeningen ze gebruiken (camelCase).
 *
 * Conventies:
 * - Bedragen zijn altijd gehele centen (`Cents`), nooit floats in euro's.
 * - Rentepercentages zijn gehele duizendsten van een procent (`MilliPercent`):
 *   3,850% → 3850. Zo rekenen we ook met rente zonder floating-point-fouten.
 * - Datums zijn ISO-strings `YYYY-MM-DD` (komt 1-op-1 overeen met Postgres `date`),
 *   tijdstempels zijn ISO-strings met tijd (Postgres `timestamptz`).
 *
 * De databasevorm (snake_case) staat in `db-types.ts`, de vertaling in `mappers.ts`.
 */

export type UUID = string
/** `YYYY-MM-DD` */
export type ISODate = string
/** ISO 8601 met tijd, bijv. `2025-01-31T10:15:00.000Z` */
export type ISODateTime = string
/** Geheel aantal eurocenten. */
export type Cents = number
/** Geheel aantal duizendsten van een procent: 3,85% = 3850. */
export type MilliPercent = number

export interface Mortgage {
  id: UUID
  name: string
  mortgageNumber: string
  /** Oorspronkelijk bedrag (hoofdsom). */
  principalCents: Cents
  startDate: ISODate
  endDate: ISODate | null
  notes: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface InterestRatePeriod {
  id: UUID
  mortgageId: UUID
  rateMilliPct: MilliPercent
  /** Ingangsdatum: het percentage geldt vanaf deze datum tot de volgende rentewijziging. */
  effectiveDate: ISODate
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Payment {
  id: UUID
  mortgageId: UUID
  date: ISODate
  interestCents: Cents
  principalCents: Cents
  description: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

type Generated = 'id' | 'createdAt' | 'updatedAt'

export type MortgageInput = Omit<Mortgage, Generated>
export type InterestRatePeriodInput = Omit<InterestRatePeriod, Generated>
export type PaymentInput = Omit<Payment, Generated>

/** Een nieuwe hypotheek wordt altijd aangemaakt met een eerste rentepercentage vanaf de startdatum. */
export interface NewMortgageInput extends MortgageInput {
  initialRateMilliPct: MilliPercent
}

export const DOCUMENT_CATEGORIES = [
  'offer',
  'deed',
  'valuation',
  'annual_statement',
  'rate_change',
  'other',
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

/** Een geüpload bestand bij een hypotheek. De inhoud zelf staat in bestandsopslag op `storagePath`. */
export interface MortgageDocument {
  id: UUID
  mortgageId: UUID
  /** Oorspronkelijke bestandsnaam, bijv. "Hypotheekakte 2025.pdf". */
  fileName: string
  mimeType: string
  sizeBytes: number
  category: DocumentCategory
  description: string | null
  /** Sleutel in de bestandsopslag (IndexedDB lokaal, Supabase Storage later). */
  storagePath: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Wat de gebruiker kan aanpassen aan een document (de inhoud niet). */
export interface DocumentMetaInput {
  fileName: string
  category: DocumentCategory
  description: string | null
}

export interface DocumentUploadInput {
  mortgageId: UUID
  file: File
  category: DocumentCategory
  description: string | null
}
