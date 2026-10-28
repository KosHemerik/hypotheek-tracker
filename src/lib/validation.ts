import type {
  Cents,
  InterestMethod,
  InterestRatePeriod,
  ISODate,
  LoanPart,
  Mortgage,
  Payment,
  PaymentLine,
  UUID,
} from '@/domain/types'
import {
  paymentsForPart,
  ratesForPart,
  sortRatesChronologically,
  totalRepaidUpTo,
} from './calculations'
import { addMonths, isValidISODate } from './dates'
import { formatCurrency, formatDate } from './format'
import { normalizeIban, validateIban } from './iban'
import { centsToInput, parseAmountToCents, parseRateToMilli } from './money'

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
  entityId: string
  name: string
  mortgageNumber: string
  startDate: string
  endDate: string
  notes: string
  /** IBAN van de geldverstrekker (optioneel). */
  counterpartyIban: string
  /** Hoe de rente geteld wordt. */
  interestMethod: InterestMethod
  /** Vervaldag (1–31), alleen bij 30/360. */
  dueDay: string
}

export type MortgageField = keyof MortgageFormValues

export interface ValidMortgage {
  entityId: string
  name: string
  mortgageNumber: string
  startDate: ISODate
  endDate: ISODate | null
  notes: string | null
  counterpartyIban: string | null
  interestMethod: InterestMethod
  dueDay: number | null
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

  if (!values.entityId) errors.entityId = 'Kies een entiteit.'
  if (!name) errors.name = 'Vul een naam in.'
  if (!mortgageNumber) errors.mortgageNumber = 'Vul een hypotheeknummer in.'

  if (!isValidISODate(values.startDate)) errors.startDate = 'Vul een geldige startdatum in.'
  else {
    const firstPayment = context.payments.reduce<ISODate | null>(
      (min, p) => (min === null || p.date < min ? p.date : min),
      null,
    )
    if (firstPayment && values.startDate > firstPayment) {
      errors.startDate = `De startdatum kan niet na de eerste betaling (${formatDate(firstPayment)}) liggen.`
    }
    // Het eerste percentage van elk leningdeel schuift mee met de startdatum; dat kan alleen
    // als de startdatum vóór de eerstvolgende rentewijziging van elk deel blijft.
    const partIds = [...new Set(context.rates.map((r) => r.loanPartId))]
    const secondRates = partIds
      .map((id) => sortRatesChronologically(ratesForPart(context.rates, id))[1])
      .filter((r): r is InterestRatePeriod => r !== undefined)
    const earliest = secondRates.reduce<InterestRatePeriod | null>(
      (min, r) => (min === null || r.effectiveDate < min.effectiveDate ? r : min),
      null,
    )
    if (earliest && values.startDate >= earliest.effectiveDate) {
      errors.startDate = `De startdatum moet vóór de rentewijziging van ${formatDate(earliest.effectiveDate)} liggen.`
    }
  }

  const dueDay = Number(values.dueDay)
  if (values.interestMethod === 'thirty_360') {
    if (!/^\d{1,2}$/.test(values.dueDay.trim()) || dueDay < 1 || dueDay > 31) {
      errors.dueDay = 'Vul de vervaldag in (1–31), bijv. 25.'
    }
  }

  if (values.counterpartyIban.trim()) {
    const ibanError = validateIban(values.counterpartyIban)
    if (ibanError) errors.counterpartyIban = ibanError
  }

  if (values.endDate) {
    if (!isValidISODate(values.endDate)) errors.endDate = 'Vul een geldige einddatum in.'
    else if (isValidISODate(values.startDate) && values.endDate <= values.startDate) {
      errors.endDate = 'De einddatum moet na de startdatum liggen.'
    }
  }

  return result(errors, () => ({
    entityId: values.entityId,
    name,
    mortgageNumber,
    startDate: values.startDate,
    endDate: values.endDate || null,
    notes: values.notes.trim() || null,
    counterpartyIban: values.counterpartyIban.trim()
      ? normalizeIban(values.counterpartyIban)
      : null,
    interestMethod: values.interestMethod,
    dueDay: values.interestMethod === 'thirty_360' ? dueDay : null,
  }))
}

// ---------------------------------------------------------------------------
// Leningdeel
// ---------------------------------------------------------------------------

export interface LoanPartFormValues {
  name: string
  principal: string
  /** Afgesproken aflossing per maand; leeg of 0 = aflossingsvrij / niets afgesproken. */
  agreedRepayment: string
  /** Alleen bij een nieuw leningdeel: het percentage vanaf de startdatum. */
  initialRate?: string
}

export type LoanPartField = keyof LoanPartFormValues

export interface ValidLoanPart {
  name: string
  principalCents: Cents
  agreedRepaymentCents: Cents
  initialRateMilliPct: number | null
}

export interface LoanPartContext {
  /** Namen van de andere delen van dezelfde hypotheek (voor uniekheid). */
  otherNames: readonly string[]
  /** Al afgelost op dit deel (bij bewerken): de hoofdsom kan niet lager. */
  repaidCents: Cents
}

export function validateLoanPart(
  values: LoanPartFormValues,
  context: LoanPartContext = { otherNames: [], repaidCents: 0 },
): ValidationResult<LoanPartField, ValidLoanPart> {
  const errors: FieldErrors<LoanPartField> = {}
  const name = values.name.trim()
  const principalCents = parseAmountToCents(values.principal)
  const agreed =
    values.agreedRepayment.trim() === '' ? 0 : parseAmountToCents(values.agreedRepayment)
  const isNew = values.initialRate !== undefined
  const initialRate = isNew ? parseRateToMilli(values.initialRate ?? '') : null

  if (!name) errors.name = 'Vul een naam in.'
  else if (context.otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'Er is al een leningdeel met deze naam.'
  }

  if (principalCents === null) errors.principal = 'Vul een geldig bedrag in, bijv. 250.000,00.'
  else if (principalCents <= 0) errors.principal = 'Het bedrag moet groter zijn dan € 0.'
  else if (principalCents < context.repaidCents) {
    errors.principal = `Op dit deel is al ${formatCurrency(context.repaidCents)} afgelost; het bedrag kan niet lager zijn.`
  }

  if (agreed === null) errors.agreedRepayment = 'Vul een geldig bedrag in, of laat leeg.'
  else if (agreed < 0) errors.agreedRepayment = 'De aflossing kan niet negatief zijn.'
  else if (principalCents !== null && principalCents > 0 && agreed > principalCents) {
    errors.agreedRepayment = 'De maandelijkse aflossing kan niet hoger zijn dan het bedrag.'
  }

  if (isNew) {
    if (initialRate === null) errors.initialRate = 'Vul een geldig percentage in, bijv. 3,85.'
    else if (initialRate > MAX_RATE_MILLI)
      errors.initialRate = 'Dit percentage lijkt te hoog (max. 20%).'
  }

  return result(errors, () => ({
    name,
    principalCents: principalCents!,
    agreedRepaymentCents: agreed!,
    initialRateMilliPct: initialRate,
  }))
}

/** Valideert alle leningdelen van een nieuwe hypotheek in één keer (namen uniek binnen de lijst). */
export function validateNewLoanParts(
  parts: readonly LoanPartFormValues[],
):
  | { ok: true; value: (ValidLoanPart & { initialRateMilliPct: number })[] }
  | { ok: false; errors: FieldErrors<LoanPartField>[]; form?: string } {
  if (parts.length === 0)
    return { ok: false, errors: [], form: 'Voeg minimaal één leningdeel toe.' }
  const results = parts.map((part, i) =>
    validateLoanPart(
      { ...part, initialRate: part.initialRate ?? '' },
      { otherNames: parts.filter((_, j) => j !== i).map((p) => p.name), repaidCents: 0 },
    ),
  )
  if (results.every((r) => r.ok)) {
    return {
      ok: true,
      value: results.map((r) => {
        const v = (r as { ok: true; value: ValidLoanPart }).value
        return { ...v, initialRateMilliPct: v.initialRateMilliPct ?? 0 }
      }),
    }
  }
  return { ok: false, errors: results.map((r) => (r.ok ? {} : r.errors)) }
}

/** Of een leningdeel verwijderd mag worden; geeft anders de reden terug. */
export function canDeleteLoanPart(
  part: LoanPart,
  mortgage: Pick<Mortgage, 'parts'>,
  payments: readonly Payment[],
): { ok: true } | { ok: false; reason: string } {
  if (mortgage.parts.length <= 1) {
    return { ok: false, reason: 'Een hypotheek heeft minimaal één leningdeel.' }
  }
  if (payments.some((p) => p.lines.some((l) => l.loanPartId === part.id))) {
    return {
      ok: false,
      reason: 'Er zijn al betalingen op dit leningdeel. Verwijder of wijzig die eerst.',
    }
  }
  return { ok: true }
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
    return { ok: false, reason: 'Een leningdeel heeft minimaal één rentepercentage.' }
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

export interface PaymentLineValues {
  loanPartId: string
  interest: string
  principal: string
}

export interface PaymentFormValues {
  date: string
  description: string
  /** Eén regel per leningdeel, in de volgorde van de delen. */
  lines: PaymentLineValues[]
}

export interface PaymentErrors {
  date?: string
  form?: string
  /** Per leningdeel. */
  lines: Record<string, { interest?: string; principal?: string }>
}

const amountInput = (cents: Cents | undefined) => (cents ? centsToInput(cents) : '')

/** Lege formulierwaarden voor een nieuwe betaling; aflossing = afgesproken aflossing per deel. */
export function newPaymentFormValues(
  parts: readonly LoanPart[],
  date: ISODate,
  description = 'Maandtermijn',
): PaymentFormValues {
  return {
    date,
    description,
    lines: parts.map((p) => ({
      loanPartId: p.id,
      interest: '',
      principal: amountInput(p.agreedRepaymentCents),
    })),
  }
}

/** Formulierwaarden voor het bewerken van een bestaande betaling. */
export function paymentToFormValues(
  payment: Payment,
  parts: readonly LoanPart[],
): PaymentFormValues {
  return {
    date: payment.date,
    description: payment.description ?? '',
    lines: parts.map((part) => {
      const line = payment.lines.find((l) => l.loanPartId === part.id)
      return {
        loanPartId: part.id,
        interest: amountInput(line?.interestCents),
        principal: amountInput(line?.principalCents),
      }
    }),
  }
}

/**
 * Formulierwaarden voor een kopie: dezelfde bedragen en omschrijving, één maand later
 * (31-01 → 28-02). Handig voor de volgende maandtermijn.
 */
export function copyPaymentFormValues(
  payment: Payment,
  parts: readonly LoanPart[],
): PaymentFormValues {
  return { ...paymentToFormValues(payment, parts), date: addMonths(payment.date, 1) }
}

export interface ValidPayment {
  date: ISODate
  description: string | null
  /** Alleen regels met een bedrag. */
  lines: PaymentLine[]
}

/**
 * Hoeveel er op een leningdeel maximaal afgelost kan worden zonder dat het saldo ooit
 * onder 0 komt. Omdat aflossingen nooit negatief zijn, daalt het saldo monotoon en is
 * het laagste punt het eindsaldo: bedrag van het deel − alle andere aflossingen erop.
 */
export function maxRepayment(
  part: Pick<LoanPart, 'id' | 'principalCents'>,
  payments: readonly Payment[],
  editingId: UUID | null,
): Cents {
  const others = paymentsForPart(
    payments.filter((p) => p.id !== editingId),
    part.id,
  )
  return Math.max(0, part.principalCents - totalRepaidUpTo(others))
}

export function validatePayment(
  values: PaymentFormValues,
  mortgage: Pick<Mortgage, 'startDate' | 'parts'>,
  payments: readonly Payment[],
  editingId: UUID | null,
): { ok: true; value: ValidPayment } | { ok: false; errors: PaymentErrors } {
  const errors: PaymentErrors = { lines: {} }
  const parsed: PaymentLine[] = []

  if (!isValidISODate(values.date)) errors.date = 'Vul een geldige datum in.'
  else if (values.date < mortgage.startDate) {
    errors.date = `De datum kan niet vóór de startdatum (${formatDate(mortgage.startDate)}) liggen.`
  }

  for (const part of mortgage.parts) {
    const line = values.lines.find((l) => l.loanPartId === part.id)
    const interest = !line || line.interest.trim() === '' ? 0 : parseAmountToCents(line.interest)
    const principal = !line || line.principal.trim() === '' ? 0 : parseAmountToCents(line.principal)
    const lineErrors: { interest?: string; principal?: string } = {}

    if (interest === null) lineErrors.interest = 'Vul een geldig bedrag in, bijv. 812,50.'
    else if (interest < 0) lineErrors.interest = 'Het rentebedrag kan niet negatief zijn.'

    if (principal === null) lineErrors.principal = 'Vul een geldig bedrag in, bijv. 450,00.'
    else if (principal < 0) lineErrors.principal = 'Het aflossingsbedrag kan niet negatief zijn.'
    else {
      const max = maxRepayment(part, payments, editingId)
      if (principal > max) {
        lineErrors.principal =
          max === 0
            ? 'Dit deel is al volledig afgelost; er kan niets meer worden afgelost.'
            : `Deze aflossing brengt het openstaande bedrag onder € 0. Er kan maximaal ${formatCurrency(max)} worden afgelost.`
      }
    }

    if (Object.keys(lineErrors).length) errors.lines[part.id] = lineErrors
    else if (interest! !== 0 || principal! !== 0) {
      parsed.push({ loanPartId: part.id, interestCents: interest!, principalCents: principal! })
    }
  }

  const hasLineErrors = Object.keys(errors.lines).length > 0
  if (!hasLineErrors && parsed.length === 0) {
    errors.form = 'Vul een rentebedrag of een aflossingsbedrag groter dan € 0 in.'
  }

  if (errors.date || errors.form || hasLineErrors) return { ok: false, errors }
  return {
    ok: true,
    value: { date: values.date, description: values.description.trim() || null, lines: parsed },
  }
}

// ---------------------------------------------------------------------------
// Entiteit
// ---------------------------------------------------------------------------

export const MAX_ENTITY_NAME_LENGTH = 80

/** Controleert een (nieuwe) entiteitsnaam; geeft een melding of `null`. */
export function validateEntityName(
  name: string,
  entities: readonly { id: string; name: string }[],
  exceptId: string | null = null,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Vul een naam in.'
  if (trimmed.length > MAX_ENTITY_NAME_LENGTH) {
    return `Gebruik maximaal ${MAX_ENTITY_NAME_LENGTH} tekens.`
  }
  const taken = entities.some(
    (e) => e.id !== exceptId && e.name.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  return taken ? 'Er bestaat al een entiteit met deze naam.' : null
}
