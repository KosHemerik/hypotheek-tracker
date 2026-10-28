import type {
  BankConnection,
  BankPsuType,
  BankTransaction,
  InterestRatePeriod,
  ISODate,
  Mortgage,
  Payment,
  PaymentInput,
} from '@/domain/types'
import { dueInterestForPaymentDate } from './calculations'
import { addDays, maxDate } from './dates'
import { normalizeIban } from './iban'
import { centsToInput } from './money'
import type { PaymentFormValues } from './validation'

/** Een BV/NV/holding is meestal een zakelijke rekening. */
export function defaultPsuType(entityName: string): BankPsuType {
  return /\b(b\.?\s?v\.?|n\.?\s?v\.?|holding|vof|v\.o\.f\.)(\s|$)/i.test(entityName)
    ? 'business'
    : 'personal'
}

export type ConsentState = 'ok' | 'expiring' | 'expired' | 'none'

/** Status van de toestemming; "expiring" vanaf 14 dagen voor het einde. */
export function consentState(
  connection: BankConnection | null,
  now: Date = new Date(),
): ConsentState {
  if (!connection || connection.status === 'revoked' || connection.status === 'pending')
    return 'none'
  if (connection.status === 'expired' || connection.status === 'error') return 'expired'
  if (!connection.validUntil) return 'ok'
  const ms = new Date(connection.validUntil).getTime() - now.getTime()
  if (ms <= 0) return 'expired'
  return ms <= 14 * 86_400_000 ? 'expiring' : 'ok'
}

/** "NL01RABO0123456789" → "NL01 RABO 0123 4567 89" */
export function formatIban(iban: string | null): string {
  return iban
    ? iban
        .replace(/\s+/g, '')
        .replace(/(.{4})/g, '$1 ')
        .trim()
    : ''
}

/**
 * Banktransacties van een hypotheek: afschrijvingen naar het rekeningnummer van de
 * geldverstrekker, oudste eerst (zodat je ze op volgorde verwerkt).
 */
export function transactionsForMortgage(
  transactions: readonly BankTransaction[],
  mortgage: Pick<Mortgage, 'counterpartyIban'>,
): BankTransaction[] {
  if (!mortgage.counterpartyIban) return []
  const iban = normalizeIban(mortgage.counterpartyIban)
  return transactions
    .filter(
      (t) => t.amountCents < 0 && t.counterpartyIban && normalizeIban(t.counterpartyIban) === iban,
    )
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || a.id.localeCompare(b.id))
}

/**
 * Eén klik: het hele bedrag van de transactie als rente óf als aflossing op één leningdeel.
 * De datum is de boekdatum (niet vóór de startdatum van de hypotheek).
 */
export function quickPaymentInput(
  transaction: BankTransaction,
  mortgage: Pick<Mortgage, 'id' | 'startDate'>,
  kind: 'interest' | 'principal',
  loanPartId: string,
): PaymentInput {
  const amount = Math.abs(transaction.amountCents)
  return {
    mortgageId: mortgage.id,
    date: maxDate(transaction.bookingDate, mortgage.startDate),
    description:
      transaction.description?.slice(0, 120) ?? (kind === 'interest' ? 'Rente' : 'Aflossing'),
    lines: [
      {
        loanPartId,
        interestCents: kind === 'interest' ? amount : 0,
        principalCents: kind === 'principal' ? amount : 0,
      },
    ],
  }
}

/**
 * Vult een nieuwe betaling in vanuit een banktransactie:
 * - datum = boekdatum;
 * - rente per leningdeel = de verschuldigde rente over de periode ervoor;
 * - aflossing: bij één deel het restant van het bankbedrag; bij meerdere delen de
 *   afgesproken aflossing per deel (zonder afspraken: het restant op het eerste deel).
 * Het formulier toont daarna het verschil met het bankbedrag.
 */
export function paymentValuesFromTransaction(
  transaction: BankTransaction,
  mortgage: Mortgage,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
): PaymentFormValues {
  const date: ISODate = maxDate(transaction.bookingDate, mortgage.startDate)
  const amount = Math.abs(transaction.amountCents)
  const due =
    date > mortgage.startDate
      ? dueInterestForPaymentDate(mortgage, rates, payments, date)
      : { parts: [], from: date, to: addDays(date, -1), dueCents: 0 }
  // De verschuldigde rente per deel, niet afgekapt: is die hoger dan het bankbedrag, dan
  // laat het formulier dat verschil zien (meestal staat er dan nog een oudere transactie open).
  const interestFor = (partId: string) =>
    due.parts.find((p) => p.loanPartId === partId)?.dueCents ?? 0
  const totalInterest = mortgage.parts.reduce((sum, p) => sum + interestFor(p.id), 0)
  const remainder = Math.max(0, amount - totalInterest)
  const agreedTotal = mortgage.parts.reduce((sum, p) => sum + p.agreedRepaymentCents, 0)

  const principalFor = (index: number) => {
    const part = mortgage.parts[index]!
    if (mortgage.parts.length === 1) return remainder
    if (agreedTotal > 0) return part.agreedRepaymentCents
    return index === 0 ? remainder : 0
  }

  return {
    date,
    description: transaction.description?.slice(0, 120) ?? transaction.counterpartyName ?? '',
    lines: mortgage.parts.map((part, i) => {
      const interest = interestFor(part.id)
      const principal = principalFor(i)
      return {
        loanPartId: part.id,
        interest: interest ? centsToInput(interest) : '',
        principal: principal ? centsToInput(principal) : '',
      }
    }),
  }
}

/** Open = nog niet vastgelegd en niet genegeerd. */
export function isOpen(transaction: BankTransaction): boolean {
  return !transaction.paymentId && !transaction.ignored
}
