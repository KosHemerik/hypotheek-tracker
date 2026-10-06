import type {
  Cents,
  InterestRatePeriod,
  ISODate,
  MilliPercent,
  Mortgage,
  Payment,
} from '@/domain/types'
import {
  addDays,
  firstDayOfMonth,
  maxDate,
  minDate,
  monthKey,
  monthsBetween,
  parseISODate,
  type MonthKey,
} from './dates'
import { roundDiv, sumCents } from './money'

/**
 * Alle hypotheekberekeningen als pure functies. Bedragen in centen, rente in
 * duizendsten procent, datums als ISO-strings. Geen side-effects, geen `Date.now()`:
 * waar "vandaag" nodig is, wordt het als argument meegegeven.
 */

/** Inclusieve periode; `null` betekent onbegrensd aan die kant. */
export interface DateRange {
  from: ISODate | null
  to: ISODate | null
}

export const ALL_TIME: DateRange = { from: null, to: null }

export function isInRange(date: ISODate, range: DateRange): boolean {
  return (range.from === null || date >= range.from) && (range.to === null || date <= range.to)
}

/** Chronologisch: op datum, bij gelijke datum op aanmaakmoment (en id als laatste tiebreak). */
export function sortPaymentsChronologically<T extends Payment>(payments: readonly T[]): T[] {
  return [...payments].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  )
}

export function sortRatesChronologically(
  rates: readonly InterestRatePeriod[],
): InterestRatePeriod[] {
  return [...rates].sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt),
  )
}

// ---------------------------------------------------------------------------
// Saldo & rente
// ---------------------------------------------------------------------------

/** Som van alle aflossingen t/m `date` (zonder `date`: alle aflossingen). */
export function totalRepaidUpTo(payments: readonly Payment[], date?: ISODate | null): Cents {
  return sumCents(
    payments.filter((p) => date == null || p.date <= date).map((p) => p.principalCents),
  )
}

/** Openstaand bedrag = hoofdsom − som van alle aflossingen t/m `date` (zonder `date`: nu, alles). */
export function outstandingAt(
  principalCents: Cents,
  payments: readonly Payment[],
  date?: ISODate | null,
): Cents {
  return principalCents - totalRepaidUpTo(payments, date)
}

/** Openstaand bedrag aan het begin van `date` (dus vóór de betalingen op die dag). */
export function outstandingBefore(
  principalCents: Cents,
  payments: readonly Payment[],
  date: ISODate,
): Cents {
  return outstandingAt(principalCents, payments, addDays(date, -1))
}

/**
 * Het geldende rentepercentage op `date`: de rentewijziging met de laatste
 * ingangsdatum op of vóór `date`. `null` als er (nog) geen percentage geldt.
 */
export function rateAt(
  rates: readonly InterestRatePeriod[],
  date: ISODate,
): InterestRatePeriod | null {
  let current: InterestRatePeriod | null = null
  for (const rate of sortRatesChronologically(rates)) {
    if (rate.effectiveDate <= date) current = rate
    else break
  }
  return current
}

/** Theoretisch verschuldigde rente per maand = openstaand × percentage / 12, afgerond op centen. */
export function theoreticalMonthlyInterest(
  outstandingCents: Cents,
  rateMilliPct: MilliPercent,
): Cents {
  // rateMilliPct / 1000 = procent; / 100 = fractie; / 12 = per maand.
  return roundDiv(outstandingCents * rateMilliPct, 1000 * 100 * 12)
}

/** Aandeel afgelost, tussen 0 en 1. */
export function shareRepaid(principalCents: Cents, outstandingCents: Cents): number {
  if (principalCents <= 0) return 0
  return Math.min(1, Math.max(0, (principalCents - outstandingCents) / principalCents))
}

// ---------------------------------------------------------------------------
// Totalen
// ---------------------------------------------------------------------------

export interface Totals {
  interestCents: Cents
  principalCents: Cents
  totalCents: Cents
  count: number
}

export function totalsInRange(payments: readonly Payment[], range: DateRange = ALL_TIME): Totals {
  const selected = payments.filter((p) => isInRange(p.date, range))
  const interestCents = sumCents(selected.map((p) => p.interestCents))
  const principalCents = sumCents(selected.map((p) => p.principalCents))
  return {
    interestCents,
    principalCents,
    totalCents: interestCents + principalCents,
    count: selected.length,
  }
}

export interface PaymentWithBalance extends Payment {
  totalCents: Cents
  /** Openstaand bedrag direct na deze betaling. */
  balanceAfterCents: Cents
}

/** Betalingen in chronologische volgorde, met het saldo na elke betaling. */
export function paymentsWithBalance(
  principalCents: Cents,
  payments: readonly Payment[],
): PaymentWithBalance[] {
  let balance = principalCents
  return sortPaymentsChronologically(payments).map((p) => {
    balance -= p.principalCents
    return { ...p, totalCents: p.interestCents + p.principalCents, balanceAfterCents: balance }
  })
}

// ---------------------------------------------------------------------------
// Reeksen voor grafieken
// ---------------------------------------------------------------------------

export interface BalancePoint {
  date: ISODate
  balanceCents: Cents
}

/**
 * Verloop van het openstaande bedrag: een punt aan het begin van de periode (of op de
 * startdatum), één punt per dag met betalingen, en een punt aan het eind van de periode.
 */
export function balanceSeries(
  mortgage: Pick<Mortgage, 'principalCents' | 'startDate'>,
  payments: readonly Payment[],
  range: DateRange,
  today: ISODate,
): BalancePoint[] {
  const from = range.from ? maxDate(range.from, mortgage.startDate) : mortgage.startDate
  const sorted = sortPaymentsChronologically(payments)
  const lastPaymentDate = sorted.at(-1)?.date ?? from
  const to = range.to ?? maxDate(today, lastPaymentDate)
  if (to < from) return []

  const points: BalancePoint[] = [
    { date: from, balanceCents: outstandingBefore(mortgage.principalCents, sorted, from) },
  ]
  const days = [...new Set(sorted.filter((p) => p.date >= from && p.date <= to).map((p) => p.date))]
  for (const day of days) {
    const point = { date: day, balanceCents: outstandingAt(mortgage.principalCents, sorted, day) }
    if (day === from) points[0] = point
    else points.push(point)
  }
  if (points.at(-1)!.date !== to) {
    points.push({ date: to, balanceCents: outstandingAt(mortgage.principalCents, sorted, to) })
  }
  return points
}

export interface MonthlyBreakdown {
  month: MonthKey
  interestCents: Cents
  principalCents: Cents
  /** Indicatie: openstaand aan het begin van de maand × geldend percentage / 12. */
  theoreticalInterestCents: Cents | null
}

/**
 * Per kalendermaand de betaalde rente en aflossing, plus de theoretisch verschuldigde
 * rente als vergelijking. Lege maanden binnen de periode worden meegenomen (als 0).
 */
export function monthlyBreakdown(
  mortgage: Pick<Mortgage, 'principalCents' | 'startDate'>,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  range: DateRange,
  today: ISODate,
): MonthlyBreakdown[] {
  const inRange = payments.filter((p) => isInRange(p.date, range))
  const startMonth = monthKey(
    range.from ? maxDate(range.from, mortgage.startDate) : mortgage.startDate,
  )
  const lastPayment = sortPaymentsChronologically(inRange).at(-1)?.date
  const endDate = range.to ?? (lastPayment ? maxDate(today, lastPayment) : today)
  const endMonth = monthKey(endDate)
  if (endMonth < startMonth) return []

  return monthsBetween(startMonth, endMonth).map((month) => {
    const ofMonth = inRange.filter((p) => monthKey(p.date) === month)
    // Rente over een maand wordt berekend over het saldo aan het begin van die maand.
    const reference = maxDate(firstDayOfMonth(month), mortgage.startDate)
    const rate = rateAt(rates, reference)
    const outstanding = outstandingBefore(mortgage.principalCents, payments, reference)
    return {
      month,
      interestCents: sumCents(ofMonth.map((p) => p.interestCents)),
      principalCents: sumCents(ofMonth.map((p) => p.principalCents)),
      theoreticalInterestCents: rate
        ? theoreticalMonthlyInterest(outstanding, rate.rateMilliPct)
        : null,
    }
  })
}

/** Telt maandoverzichten van meerdere hypotheken per maand op (chronologisch). */
export function combineMonthlyBreakdowns(lists: readonly MonthlyBreakdown[][]): MonthlyBreakdown[] {
  const byMonth = new Map<MonthKey, MonthlyBreakdown>()
  for (const row of lists.flat()) {
    const existing = byMonth.get(row.month)
    byMonth.set(
      row.month,
      existing
        ? {
            month: row.month,
            interestCents: existing.interestCents + row.interestCents,
            principalCents: existing.principalCents + row.principalCents,
            theoreticalInterestCents:
              existing.theoreticalInterestCents === null && row.theoreticalInterestCents === null
                ? null
                : (existing.theoreticalInterestCents ?? 0) + (row.theoreticalInterestCents ?? 0),
          }
        : { ...row },
    )
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}

// ---------------------------------------------------------------------------
// Jaaroverzicht
// ---------------------------------------------------------------------------

export interface YearSummary {
  year: number
  interestCents: Cents
  principalCents: Cents
  /** Saldo op 1 januari (of op de startdatum als de hypotheek in dat jaar begon). */
  openingBalanceCents: Cents
  /** Saldo op 31 december (of vandaag, voor het lopende jaar). */
  closingBalanceCents: Cents
  paymentCount: number
}

/** Per kalenderjaar, van het startjaar t/m het laatste jaar met data (of het huidige jaar). Nieuwste eerst. */
export function yearOverview(
  mortgage: Pick<Mortgage, 'principalCents' | 'startDate'>,
  payments: readonly Payment[],
  today: ISODate,
): YearSummary[] {
  const startYear = parseISODate(mortgage.startDate).year
  const lastYear = Math.max(
    parseISODate(today).year,
    ...payments.map((p) => parseISODate(p.date).year),
  )
  const result: YearSummary[] = []
  for (let year = lastYear; year >= startYear; year--) {
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const totals = totalsInRange(payments, { from: yearStart, to: yearEnd })
    result.push({
      year,
      interestCents: totals.interestCents,
      principalCents: totals.principalCents,
      openingBalanceCents: outstandingBefore(
        mortgage.principalCents,
        payments,
        maxDate(yearStart, mortgage.startDate),
      ),
      closingBalanceCents: outstandingAt(mortgage.principalCents, payments, yearEnd),
      paymentCount: totals.count,
    })
  }
  return result
}

/** Telt jaaroverzichten van meerdere hypotheken per jaar op. */
export function combineYearOverviews(overviews: readonly YearSummary[][]): YearSummary[] {
  const byYear = new Map<number, YearSummary>()
  for (const row of overviews.flat()) {
    const existing = byYear.get(row.year)
    byYear.set(
      row.year,
      existing
        ? {
            year: row.year,
            interestCents: existing.interestCents + row.interestCents,
            principalCents: existing.principalCents + row.principalCents,
            openingBalanceCents: existing.openingBalanceCents + row.openingBalanceCents,
            closingBalanceCents: existing.closingBalanceCents + row.closingBalanceCents,
            paymentCount: existing.paymentCount + row.paymentCount,
          }
        : { ...row },
    )
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

// ---------------------------------------------------------------------------
// Samenvatting per hypotheek (voor kaarten en kerncijfers)
// ---------------------------------------------------------------------------

export interface MortgageSummary {
  principalCents: Cents
  /** Openstaand aan het eind van de periode (of vandaag, als de periode doorloopt). */
  outstandingCents: Cents
  balanceDate: ISODate
  currentRate: InterestRatePeriod | null
  shareRepaid: number
  period: Totals
  allTime: Totals
  /** Theoretische rente voor de huidige maand o.b.v. het huidige saldo en percentage. */
  theoreticalMonthlyInterestCents: Cents | null
}

export function summarizeMortgage(
  mortgage: Pick<Mortgage, 'principalCents' | 'startDate'>,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  range: DateRange,
  today: ISODate,
): MortgageSummary {
  const balanceDate = range.to ? minDate(range.to, today) : today
  // Voor een periode die in de toekomst doorloopt tellen we ook vooruitgeboekte betalingen niet mee.
  const outstandingCents = outstandingAt(mortgage.principalCents, payments, balanceDate)
  const currentRate = rateAt(rates, today)
  const currentOutstanding = outstandingAt(mortgage.principalCents, payments, today)
  return {
    principalCents: mortgage.principalCents,
    outstandingCents,
    balanceDate,
    currentRate,
    shareRepaid: shareRepaid(mortgage.principalCents, outstandingCents),
    period: totalsInRange(payments, range),
    allTime: totalsInRange(payments),
    theoreticalMonthlyInterestCents: currentRate
      ? theoreticalMonthlyInterest(currentOutstanding, currentRate.rateMilliPct)
      : null,
  }
}
