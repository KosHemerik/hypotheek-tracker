import type {
  InterestRatePeriodInsert,
  MortgageDocumentRow,
  InterestRatePeriodRow,
  MortgageInsert,
  MortgageRow,
  PaymentInsert,
  PaymentRow,
} from './db-types'
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type DocumentMetaInput,
  type MortgageDocument,
} from './types'
import type {
  InterestRatePeriod,
  InterestRatePeriodInput,
  MilliPercent,
  Mortgage,
  MortgageInput,
  Payment,
  PaymentInput,
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

export function mortgageFromRow(row: MortgageRow): Mortgage {
  return {
    id: row.id,
    name: row.name,
    mortgageNumber: row.mortgage_number,
    principalCents: Number(row.principal_cents),
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mortgageToInsert(input: MortgageInput): MortgageInsert {
  return {
    name: input.name,
    mortgage_number: input.mortgageNumber,
    principal_cents: input.principalCents,
    start_date: input.startDate,
    end_date: input.endDate,
    notes: input.notes,
  }
}

export function rateFromRow(row: InterestRatePeriodRow): InterestRatePeriod {
  return {
    id: row.id,
    mortgageId: row.mortgage_id,
    rateMilliPct: ratePercentageToMilli(row.rate_percentage),
    effectiveDate: row.effective_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rateToInsert(input: InterestRatePeriodInput): InterestRatePeriodInsert {
  return {
    mortgage_id: input.mortgageId,
    rate_percentage: milliToRatePercentage(input.rateMilliPct),
    effective_date: input.effectiveDate,
  }
}

export function paymentFromRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    mortgageId: row.mortgage_id,
    date: row.payment_date,
    interestCents: Number(row.interest_cents),
    principalCents: Number(row.principal_cents),
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function paymentToInsert(input: PaymentInput): PaymentInsert {
  return {
    mortgage_id: input.mortgageId,
    payment_date: input.date,
    interest_cents: input.interestCents,
    principal_cents: input.principalCents,
    description: input.description,
  }
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
