import type {
  BankConnectionRow,
  BankTransactionRow,
  EntityRow,
  InterestRatePeriodInsert,
  InterestRatePeriodRow,
  LoanPartInsert,
  LoanPartRow,
  MortgageDocumentRow,
  MortgageInsert,
  MortgageWithPartsRow,
  PaymentLineRow,
  PaymentWithLinesRow,
} from './db-types'
import {
  DOCUMENT_CATEGORIES,
  type BankConnection,
  type BankTransaction,
  type DocumentCategory,
  type DocumentMetaInput,
  type Entity,
  type InterestRatePeriod,
  type InterestRatePeriodInput,
  type LoanPart,
  type LoanPartInput,
  type MilliPercent,
  type Mortgage,
  type MortgageDocument,
  type MortgageInput,
  type Payment,
  type PaymentLine,
} from './types'

/** `numeric(6,3)` uit de database ("3.850" of 3.85) → 3850, zonder float-fouten. */
export function ratePercentageToMilli(value: number | string): MilliPercent {
  const str = typeof value === 'number' ? value.toFixed(3) : value.trim()
  const match = /^(-?)(\d+)(?:\.(\d{0,3})\d*)?$/.exec(str)
  if (!match) throw new Error(`Ongeldig rentepercentage uit database: ${value}`)
  const [, sign, whole, fraction = ''] = match
  const milli = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
  return sign === '-' ? -milli : milli
}

/** 3850 → "3.850" (string, zodat Postgres numeric exact blijft). */
export function milliToRatePercentage(milli: MilliPercent): string {
  const sign = milli < 0 ? '-' : ''
  const abs = Math.abs(milli)
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`
}

/** Vaste volgorde van leningdelen: op aanmaakmoment, dan id. */
export function sortParts<T extends { createdAt: string; id: string }>(parts: readonly T[]): T[] {
  return [...parts].sort(
    (x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id),
  )
}

export function loanPartFromRow(row: LoanPartRow): LoanPart {
  return {
    id: row.id,
    mortgageId: row.mortgage_id,
    name: row.name,
    principalCents: Number(row.principal_cents),
    agreedRepaymentCents: Number(row.agreed_repayment_cents ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function loanPartToInsert(input: LoanPartInput): LoanPartInsert {
  return {
    mortgage_id: input.mortgageId,
    name: input.name,
    principal_cents: input.principalCents,
    agreed_repayment_cents: input.agreedRepaymentCents,
  }
}

/** Hypotheek met zijn leningdelen; de hoofdsom is de som van de delen. */
export function mortgageFromRow(row: MortgageWithPartsRow): Mortgage {
  const parts = sortParts(row.loan_parts.map(loanPartFromRow))
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    mortgageNumber: row.mortgage_number,
    principalCents: parts.reduce((sum, p) => sum + p.principalCents, 0),
    parts,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    counterpartyIban: row.counterparty_iban ?? null,
    archivedAt: row.archived_at ?? null,
    interestMethod: row.interest_method === 'thirty_360' ? 'thirty_360' : 'actual',
    dueDay: row.due_day ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mortgageToInsert(input: MortgageInput): MortgageInsert {
  return {
    entity_id: input.entityId,
    name: input.name,
    mortgage_number: input.mortgageNumber,
    start_date: input.startDate,
    end_date: input.endDate,
    notes: input.notes,
    counterparty_iban: input.counterpartyIban,
    interest_method: input.interestMethod,
    due_day: input.interestMethod === 'thirty_360' ? input.dueDay : null,
  }
}

export function rateFromRow(row: InterestRatePeriodRow): InterestRatePeriod {
  return {
    id: row.id,
    mortgageId: row.mortgage_id,
    loanPartId: row.loan_part_id,
    rateMilliPct: ratePercentageToMilli(row.rate_percentage),
    effectiveDate: row.effective_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rateToInsert(input: InterestRatePeriodInput): InterestRatePeriodInsert {
  return {
    mortgage_id: input.mortgageId,
    loan_part_id: input.loanPartId,
    rate_percentage: milliToRatePercentage(input.rateMilliPct),
    effective_date: input.effectiveDate,
  }
}

export function paymentLineFromRow(row: PaymentLineRow): PaymentLine {
  return {
    loanPartId: row.loan_part_id,
    interestCents: Number(row.interest_cents),
    principalCents: Number(row.principal_cents),
  }
}

/** Betaling met regels per leningdeel; de totalen zijn de som van de regels. */
export function paymentFromRow(row: PaymentWithLinesRow): Payment {
  const lines = row.payment_lines.map(paymentLineFromRow)
  return {
    id: row.id,
    mortgageId: row.mortgage_id,
    date: row.payment_date,
    lines,
    interestCents: lines.reduce((sum, l) => sum + l.interestCents, 0),
    principalCents: lines.reduce((sum, l) => sum + l.principalCents, 0),
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Regels zoals de database-functie `save_payment` ze verwacht (lege regels weggelaten). */
export function paymentLinesToJson(lines: readonly PaymentLine[]) {
  return lines
    .filter((l) => l.interestCents !== 0 || l.principalCents !== 0)
    .map((l) => ({
      loan_part_id: l.loanPartId,
      interest_cents: l.interestCents,
      principal_cents: l.principalCents,
    }))
}

function toCategory(value: string): DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as DocumentCategory)
    : 'other'
}

export function documentFromRow(row: MortgageDocumentRow): MortgageDocument {
  return {
    id: row.id,
    mortgageId: row.mortgage_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    category: toCategory(row.category),
    description: row.description,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function documentMetaToUpdate(
  input: DocumentMetaInput,
): Pick<MortgageDocumentRow, 'file_name' | 'category' | 'description'> {
  return { file_name: input.fileName, category: input.category, description: input.description }
}

export function entityFromRow(row: EntityRow): Entity {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

/** Kolommen die de app van een bankkoppeling mag zien (geen sessie-id of account-uid). */
export const BANK_CONNECTION_COLUMNS =
  'id, entity_id, status, psu_type, aspsp_name, iban, account_name, valid_until, last_synced_at, balance_cents, balance_date, last_error, available_accounts'

export function bankConnectionFromRow(row: BankConnectionRow): BankConnection {
  return {
    id: row.id,
    entityId: row.entity_id,
    status: row.status as BankConnection['status'],
    psuType: row.psu_type === 'business' ? 'business' : 'personal',
    aspspName: row.aspsp_name,
    iban: row.iban,
    accountName: row.account_name,
    validUntil: row.valid_until,
    lastSyncedAt: row.last_synced_at,
    balanceCents: row.balance_cents === null ? null : Number(row.balance_cents),
    balanceDate: row.balance_date,
    lastError: row.last_error,
    availableAccounts: row.status === 'choose_account' ? (row.available_accounts ?? []) : [],
  }
}

export function bankTransactionFromRow(row: BankTransactionRow): BankTransaction {
  return {
    id: row.id,
    entityId: row.entity_id,
    connectionId: row.connection_id,
    bookingDate: row.booking_date,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    counterpartyName: row.counterparty_name,
    counterpartyIban: row.counterparty_iban,
    description: row.description,
    paymentId: row.payment_id,
    ignored: row.ignored,
  }
}
