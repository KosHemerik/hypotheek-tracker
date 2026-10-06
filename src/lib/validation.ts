import type { Cents, InterestRatePeriod, ISODate, Mortgage, Payment, UUID } from '@/domain/types'
import { totalRepaidUpTo, sortRatesChronologically } from './calculations'
import { isValidISODate } from './dates'
import { formatCurrency, formatDate } from './format'
import { parseAmountToCents, parseRateToMilli } from './money'

/**
 * Validatie van formulierinvoer als pure functies. Elke functie krijgt de ruwe
 * (string)invoer, en geeft óf foutmeldingen per veld óf een geparste, geldige waarde terug.
 */

export type FieldErrors<F extends string> = Partial<Record<F | 'form', string>>

export type ValidationResult<F extends string, V> =
  { ok: true; value: V } | { ok: false; errors: FieldErrors<F> }

function result<F extends string, V>(
  errors: FieldErrors<F>,
  value: () => V,
): ValidationResult<F, V> {
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: value() }
}

const MAX_RATE_MILLI = 20_000 // 20%: vangnet tegen typefouten (bijv. 385 i.p.v. 3,85)

// ---------------------------------------------------------------------------
// Hypotheek
// ---------------------------------------------------------------------------

export interface MortgageFormValues {
  name: string
  mortgageNumber: string
  principal: string
  startDate: string
  endDate: string
  notes: string
  /** Alleen bij aanmaken. */
  initialRate?: string
}

export type MortgageField = keyof MortgageFormValues

export interface ValidMortgage {
  name: string
  mortgageNumber: string
  principalCents: Cents
  startDate: ISODate
  endDate: ISODate | null
  notes: string | null
  initialRateMilliPct: number | null
}

export interface MortgageContext {
  /** Bestaande data bij bewerken; leeg bij aanmaken. */
  payments: readonly Payment[]
  rates: readonly InterestRatePeriod[]
}

export function validateMortgage(
  values: MortgageFormValues,
  context: MortgageContext = { payments: [], rates: [] },
): ValidationResult<MortgageField, ValidMortgage> {
  const errors: FieldErrors<MortgageField> = {}
  const name = values.name.trim()
  const mortgageNumber = values.mortgageNumber.trim()
  const principalCents = parseAmountToCents(values.principal)
  const isCreate = values.initialRate !== undefined
  const initialRate = isCreate ? parseRateToMilli(values.initialRate ?? '') : null

  if (!name) errors.name = 'Vul een naam in.'
  if (!mortgageNumber) errors.mortgageNumber = 'Vul een hypotheeknummer in.'

  if (principalCents === null) errors.principal = 'Vul een geldig bedrag in, bijv. 250.000,00.'
  else if (principalCents <= 0) errors.principal = 'De hoofdsom moet groter zijn dan € 0.'
  else {
    const repaid = totalRepaidUpTo(context.payments)
    if (principalCents < repaid) {
      errors.principal = `Er is al ${formatCurrency(repaid)} afgelost; de hoofdsom kan niet lager zijn.`
    }
  }

  if (!isValidISODate(values.startDate)) errors.startDate = 'Vul een geldige startdatum in.'
  else {
    const firstPayment = context.payments.reduce<ISODate | null>(
      (min, p) => (min === null || p.date < min ? p.date : min),
      null,
    )
    if (firstPayment && values.startDate > firstPayment) {
      errors.startDate = `De startdatum kan niet na de eerste betaling (${formatDate(firstPayment)}) liggen.`
    }
    const secondRate = sortRatesChronologically(context.rates)[1]
    if (secondRate && values.startDate >= secondRate.effectiveDate) {
      errors.startDate = `De startdatum moet vóór de rentewijziging van ${formatDate(secondRate.effectiveDate)} liggen.`
    }
  }

  if (values.endDate) {
    if (!isValidISODate(values.endDate)) errors.endDate = 'Vul een geldige einddatum in.'
    else if (isValidISODate(values.startDate) && values.endDate <= values.startDate) {
      errors.endDate = 'De einddatum moet na de startdatum liggen.'
    }
  }

  if (isCreate) {
    if (initialRate === null) errors.initialRate = 'Vul een geldig percentage in, bijv. 3,85.'
    else if (initialRate > MAX_RATE_MILLI)
      errors.initialRate = 'Dit percentage lijkt te hoog (max. 20%).'
  }

  return result(errors, () => ({
    name,
    mortgageNumber,
    principalCents: principalCents!,
    startDate: values.startDate,
    endDate: values.endDate || null,
    notes: values.notes.trim() || null,
    initialRateMilliPct: initialRate,
  }))
}

// ---------------------------------------------------------------------------
// Rentewijziging
// ---------------------------------------------------------------------------

export interface RateFormValues {
  rate: string
  effectiveDate: string
}

export type RateField = keyof RateFormValues

export function validateRate(
  values: RateFormValues,
  mortgage: Pick<Mortgage, 'startDate'>,
  rates: readonly InterestRatePeriod[],
  editingId: UUID | null,
): ValidationResult<RateField, { rateMilliPct: number; effectiveDate: ISODate }> {
  const errors: FieldErrors<RateField> = {}
  const rateMilliPct = parseRateToMilli(values.rate)
  const others = rates.filter((r) => r.id !== editingId)
  const editing = rates.find((r) => r.id === editingId)

  if (rateMilliPct === null)
    errors.rate = 'Vul een geldig percentage in, bijv. 3,85 (max. 3 decimalen).'
  else if (rateMilliPct > MAX_RATE_MILLI) errors.rate = 'Dit percentage lijkt te hoog (max. 20%).'

  if (!isValidISODate(values.effectiveDate))
    errors.effectiveDate = 'Vul een geldige ingangsdatum in.'
  else if (values.effectiveDate < mortgage.startDate) {
    errors.effectiveDate = `De ingangsdatum kan niet vóór de startdatum (${formatDate(mortgage.startDate)}) liggen.`
  } else if (others.some((r) => r.effectiveDate === values.effectiveDate)) {
    errors.effectiveDate = 'Er is al een rentepercentage met deze ingangsdatum.'
  } else if (
    editing?.effectiveDate === mortgage.startDate &&
    values.effectiveDate !== mortgage.startDate
  ) {
    errors.effectiveDate =
      'Dit is het percentage vanaf de startdatum; de ingangsdatum hiervan kan niet worden verplaatst.'
  }

  return result(errors, () => ({
    rateMilliPct: rateMilliPct!,
    effectiveDate: values.effectiveDate,
  }))
}

/** Of een rentewijziging verwijderd mag worden; geeft anders de reden terug. */
export function canDeleteRate(
  rate: InterestRatePeriod,
  mortgage: Pick<Mortgage, 'startDate'>,
  rates: readonly InterestRatePeriod[],
): { ok: true } | { ok: false; reason: string } {
  if (rates.length <= 1) {
    return { ok: false, reason: 'Een hypotheek heeft minimaal één rentepercentage.' }
  }
  if (rate.effectiveDate <= mortgage.startDate) {
    return {
      ok: false,
      reason:
        'Het percentage vanaf de startdatum kan niet worden verwijderd. Pas het eventueel aan.',
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Betaling
// ---------------------------------------------------------------------------

export interface PaymentFormValues {
  date: string
  interest: string
  principal: string
  description: string
}

export type PaymentField = keyof PaymentFormValues

export interface ValidPayment {
  date: ISODate
  interestCents: Cents
  principalCents: Cents
  description: string | null
}

/**
 * Hoeveel er bij een betaling maximaal afgelost kan worden zonder dat het saldo ooit
 * onder 0 komt. Omdat aflossingen nooit negatief zijn, daalt het saldo monotoon en is
 * het laagste punt het eindsaldo: hoofdsom − alle andere aflossingen.
 */
export function maxRepayment(
  mortgage: Pick<Mortgage, 'principalCents'>,
  payments: readonly Payment[],
  editingId: UUID | null,
): Cents {
  const others = payments.filter((p) => p.id !== editingId)
  return Math.max(0, mortgage.principalCents - totalRepaidUpTo(others))
}

export function validatePayment(
  values: PaymentFormValues,
  mortgage: Pick<Mortgage, 'principalCents' | 'startDate'>,
  payments: readonly Payment[],
  editingId: UUID | null,
): ValidationResult<PaymentField, ValidPayment> {
  const errors: FieldErrors<PaymentField> = {}
  const interestCents = values.interest.trim() === '' ? 0 : parseAmountToCents(values.interest)
  const principalCents = values.principal.trim() === '' ? 0 : parseAmountToCents(values.principal)

  if (!isValidISODate(values.date)) errors.date = 'Vul een geldige datum in.'
  else if (values.date < mortgage.startDate) {
    errors.date = `De datum kan niet vóór de startdatum (${formatDate(mortgage.startDate)}) liggen.`
  }

  if (interestCents === null) errors.interest = 'Vul een geldig bedrag in, bijv. 812,50.'
  else if (interestCents < 0) errors.interest = 'Het rentebedrag kan niet negatief zijn.'

  if (principalCents === null) errors.principal = 'Vul een geldig bedrag in, bijv. 450,00.'
  else if (principalCents < 0) errors.principal = 'Het aflossingsbedrag kan niet negatief zijn.'
  else {
    const max = maxRepayment(mortgage, payments, editingId)
    if (principalCents > max) {
      errors.principal =
        max === 0
          ? 'De hypotheek is al volledig afgelost; er kan niets meer worden afgelost.'
          : `Deze aflossing brengt het openstaande bedrag onder € 0. Er kan maximaal ${formatCurrency(max)} worden afgelost.`
    }
  }

  if (!errors.interest && !errors.principal && interestCents === 0 && principalCents === 0) {
    errors.form = 'Vul een rentebedrag of een aflossingsbedrag groter dan € 0 in.'
  }

  return result(errors, () => ({
    date: values.date,
    interestCents: interestCents!,
    principalCents: principalCents!,
    description: values.description.trim() || null,
  }))
}
