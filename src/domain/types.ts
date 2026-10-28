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

/** Een (rechts)persoon waar hypotheken onder vallen, bijv. privé of een BV. */
export interface Entity {
  id: UUID
  name: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Mortgage {
  id: UUID
  entityId: UUID
  name: string
  mortgageNumber: string
  /** Oorspronkelijk bedrag (hoofdsom): de som van de leningdelen. */
  principalCents: Cents
  /** Leningdelen in vaste volgorde; altijd minimaal één. */
  parts: LoanPart[]
  startDate: ISODate
  endDate: ISODate | null
  notes: string | null
  /** Rekeningnummer (IBAN) van de geldverstrekker; bepaalt welke banktransacties hierbij horen. */
  counterpartyIban: string | null
  /** Moment van archiveren; `null` = actief. */
  archivedAt: ISODateTime | null
  /**
   * Hoe de verschuldigde rente geteld wordt:
   * - `actual`: werkelijke kalenderdagen tot de betaaldag;
   * - `thirty_360`: elke maand 30 dagen, renteperiodes t/m de vervaldag (`dueDay`).
   */
  interestMethod: InterestMethod
  /** Vervaldag (1–31) bij `thirty_360`; anders `null`. */
  dueDay: number | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Een leningdeel: eigen bedrag, eigen rentehistorie, eigen aflossingsafspraak. */
export interface LoanPart {
  id: UUID
  mortgageId: UUID
  name: string
  principalCents: Cents
  /** Afgesproken aflossing per maand; 0 = aflossingsvrij of niets afgesproken. */
  agreedRepaymentCents: Cents
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface InterestRatePeriod {
  id: UUID
  mortgageId: UUID
  loanPartId: UUID
  rateMilliPct: MilliPercent
  /** Ingangsdatum: het percentage geldt vanaf deze datum tot de volgende rentewijziging. */
  effectiveDate: ISODate
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** Rente en aflossing van één leningdeel binnen een betaling. */
export interface PaymentLine {
  loanPartId: UUID
  interestCents: Cents
  principalCents: Cents
}

export interface Payment {
  id: UUID
  mortgageId: UUID
  date: ISODate
  /** Per leningdeel (alleen delen waarvoor iets betaald is). */
  lines: PaymentLine[]
  /** Totaal rente van alle regels. */
  interestCents: Cents
  /** Totaal aflossing van alle regels. */
  principalCents: Cents
  description: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

type Generated = 'id' | 'createdAt' | 'updatedAt'

export type InterestMethod = 'actual' | 'thirty_360'

export type MortgageInput = Omit<Mortgage, Generated | 'principalCents' | 'parts' | 'archivedAt'>
export type InterestRatePeriodInput = Omit<InterestRatePeriod, Generated>
export type PaymentInput = Omit<Payment, Generated | 'interestCents' | 'principalCents'>

export interface LoanPartInput {
  mortgageId: UUID
  name: string
  principalCents: Cents
  agreedRepaymentCents: Cents
}

/** Een nieuw leningdeel start altijd met een rentepercentage vanaf de startdatum. */
export interface NewLoanPartInput extends LoanPartInput {
  initialRateMilliPct: MilliPercent
}

/** Een nieuwe hypotheek wordt aangemaakt met één of meer leningdelen, elk met een startrente. */
export interface NewMortgageInput extends MortgageInput {
  parts: Omit<NewLoanPartInput, 'mortgageId'>[]
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

// ---------------------------------------------------------------------------
// Bankkoppeling (alleen lezen, via Enable Banking)
// ---------------------------------------------------------------------------

export type BankConnectionStatus =
  'pending' | 'choose_account' | 'active' | 'expired' | 'revoked' | 'error'

export type BankPsuType = 'personal' | 'business'

export interface BankAccountOption {
  uid: string
  iban: string | null
  name: string | null
}

/** Per entiteit maximaal één gekoppelde rekening. */
export interface BankConnection {
  id: UUID
  entityId: UUID
  status: BankConnectionStatus
  psuType: BankPsuType
  aspspName: string
  iban: string | null
  accountName: string | null
  /** Tot wanneer de toestemming van de bank geldt. */
  validUntil: ISODateTime | null
  lastSyncedAt: ISODateTime | null
  balanceCents: Cents | null
  balanceDate: ISODate | null
  lastError: string | null
  /** Alleen bij status `choose_account`. */
  availableAccounts: BankAccountOption[]
}

export interface BankTransaction {
  id: UUID
  entityId: UUID
  connectionId: UUID
  bookingDate: ISODate
  /** Negatief = afschrijving. */
  amountCents: Cents
  currency: string
  counterpartyName: string | null
  counterpartyIban: string | null
  description: string | null
  /** Gekoppelde betaling, als de transactie als betaling is vastgelegd. */
  paymentId: UUID | null
  ignored: boolean
}

export interface BankLinkResult {
  entityId: UUID
  status: BankConnectionStatus
  accounts?: BankAccountOption[]
  added?: number
}
