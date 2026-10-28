import type {
  Cents,
  InterestMethod,
  InterestRatePeriod,
  ISODate,
  LoanPart,
  MilliPercent,
  Mortgage,
  Payment,
} from '@/domain/types'
import {
  addDays,
  addMonths,
  daysInMonth,
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
// Leningdelen
// ---------------------------------------------------------------------------

/**
 * Een hypotheek zoals de berekeningen hem nodig hebben. `principalCents` is de som van
 * de delen; betalingen hebben totalen (`interestCents`/`principalCents`) én regels per deel.
 * Functies op hypotheekniveau rekenen per leningdeel en tellen op.
 */
export type MortgageLike = Pick<Mortgage, 'principalCents' | 'startDate' | 'parts'> &
  Partial<Pick<Mortgage, 'interestMethod' | 'dueDay'>>

/** Rentepercentages van één leningdeel. */
export function ratesForPart(
  rates: readonly InterestRatePeriod[],
  loanPartId: string,
): InterestRatePeriod[] {
  return rates.filter((r) => r.loanPartId === loanPartId)
}

/**
 * Betalingen bekeken vanuit één leningdeel: de bedragen zijn die van de regel voor dat
 * deel (0 als er voor dat deel niets betaald is). Datum en id blijven gelijk.
 */
export function paymentsForPart(payments: readonly Payment[], loanPartId: string): Payment[] {
  return payments.map((p) => {
    const line = p.lines.find((l) => l.loanPartId === loanPartId)
    return {
      ...p,
      lines: line ? [line] : [],
      interestCents: line?.interestCents ?? 0,
      principalCents: line?.principalCents ?? 0,
    }
  })
}

/** Gewogen gemiddelde van percentages (gewicht = bedrag), afgerond op duizendsten procent. */
export function weightedRate(
  items: readonly { rateMilliPct: number; weightCents: number }[],
): number | null {
  const total = items.reduce((sum, i) => sum + i.weightCents, 0)
  if (items.length === 0) return null
  if (total <= 0) return Math.round(items.reduce((s, i) => s + i.rateMilliPct, 0) / items.length)
  return Math.round(items.reduce((sum, i) => sum + i.rateMilliPct * i.weightCents, 0) / total)
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
// Rentecontrole: hoeveel rente had er betaald moeten worden?
// ---------------------------------------------------------------------------

/** Verschillen tot en met € 1 tellen als "klopt" (afronding, rekenmethode van de bank). */
export const INTEREST_TOLERANCE_CENTS = 100

export type InterestStatus = 'ok' | 'under' | 'over'

export function interestStatus(differenceCents: Cents): InterestStatus {
  if (differenceCents < -INTEREST_TOLERANCE_CENTS) return 'under'
  if (differenceCents > INTEREST_TOLERANCE_CENTS) return 'over'
  return 'ok'
}

/**
 * Opgebouwde rente over de dagen `from` t/m `to` (inclusief).
 *
 * Per dag: openstaand bedrag × geldend percentage / 12, naar rato van het aantal dagen
 * in die maand. Een volle maand zonder wijzigingen geeft dus exact saldo × % / 12;
 * rentewijzigingen en (extra) aflossingen midden in een maand tellen vanaf die dag.
 * Een aflossing verlaagt het saldo vanaf de dag van de betaling zelf.
 *
 * Er wordt pas aan het eind op centen afgerond (de som van dagbedragen is exact
 * genoeg: alle tussenwaarden zijn gehele getallen gedeeld door een kleine noemer).
 */
export function accruedInterest(
  principalCents: Cents,
  rates: readonly Pick<InterestRatePeriod, 'effectiveDate' | 'rateMilliPct'>[],
  payments: readonly Pick<Payment, 'date' | 'principalCents'>[],
  from: ISODate,
  to: ISODate,
  method: InterestMethod = 'actual',
): Cents {
  if (to < from) return 0
  const repayments = payments
    .filter((p) => p.principalCents !== 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const sortedRates = [...rates].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))

  let balance = principalCents
  let ri = 0
  let rate: number | null = null
  let pi = 0
  while (pi < repayments.length && repayments[pi]!.date < from)
    balance -= repayments[pi++]!.principalCents

  let total = 0
  for (let day = from; day <= to; day = addDays(day, 1)) {
    while (pi < repayments.length && repayments[pi]!.date <= day)
      balance -= repayments[pi++]!.principalCents
    while (ri < sortedRates.length && sortedRates[ri]!.effectiveDate <= day)
      rate = sortedRates[ri++]!.rateMilliPct
    if (rate === null || balance <= 0) continue
    const { year, month, day: dayOfMonth } = parseISODate(day)
    const monthDays = daysInMonth(year, month)
    // Aandeel van een maand dat deze dag telt.
    const weight = method === 'thirty_360' ? days30(dayOfMonth, monthDays) / 30 : 1 / monthDays
    total += (balance * rate * weight) / 1_200_000
  }
  return Math.round(total)
}

/**
 * 30/360: elke maand telt als 30 dagen. Dag 1–30 tellen elk 1; de 31e telt 0; de laatste
 * dag van februari vult aan tot 30 (28 feb telt 3, 29 feb telt 2).
 */
export function days30(dayOfMonth: number, monthDays: number): number {
  if (dayOfMonth < monthDays) return dayOfMonth <= 30 ? 1 : 0
  return 30 - monthDays + 1
}

/**
 * Bij 30/360 met vervaldag: de vervaldatum waar een betaling bij hoort. Een incasso valt
 * vaak een paar dagen ná de vervaldag (weekend) of soms vlak ervoor; binnen 7 dagen vóór
 * de vervaldag telt de betaling voor de vervaldag van die maand, anders voor de vorige.
 */
export function dueDateFor(paymentDate: ISODate, dueDay: number): ISODate {
  const { year, month } = parseISODate(paymentDate)
  const inMonth = (y: number, m: number) => {
    const day = Math.min(dueDay, daysInMonth(y, m))
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const thisMonth = inMonth(year, month)
  if (thisMonth <= paymentDate || addDays(paymentDate, 7) >= thisMonth) return thisMonth
  const prev = parseISODate(addMonths(`${year}-${String(month).padStart(2, '0')}-01`, -1))
  return inMonth(prev.year, prev.month)
}

/** Rekenmethode van een hypotheek; zonder vervaldag valt 30/360 terug op werkelijke dagen. */
function convention(mortgage: MortgageLike): { method: InterestMethod; dueDay: number | null } {
  return mortgage.interestMethod === 'thirty_360' && mortgage.dueDay
    ? { method: 'thirty_360', dueDay: mortgage.dueDay }
    : { method: 'actual', dueDay: null }
}

/**
 * Bij 30/360 met vervaldag gaat de aflossing van een termijn pas in na de vervaldag (de
 * rente over die periode is over het oude saldo). Extra aflossingen zonder rente tellen
 * vanaf hun eigen datum.
 */
function paymentsForAccrual(payments: readonly Payment[], mortgage: MortgageLike): Payment[] {
  const { method, dueDay } = convention(mortgage)
  if (method !== 'thirty_360' || !dueDay) return [...payments]
  return payments.map((p) =>
    p.interestCents > 0 ? { ...p, date: addDays(dueDateFor(p.date, dueDay), 1) } : p,
  )
}

/** Einddatum (inclusief) van de renteperiode die een betaling op `date` afsluit. */
function periodEnd(date: ISODate, mortgage: MortgageLike): ISODate {
  const { method, dueDay } = convention(mortgage)
  return method === 'thirty_360' && dueDay ? dueDateFor(date, dueDay) : addDays(date, -1)
}

/** Begindatum van de volgende periode na een rentebetaling op `date`. */
function nextPeriodStart(date: ISODate, mortgage: MortgageLike): ISODate {
  const { method, dueDay } = convention(mortgage)
  return method === 'thirty_360' && dueDay ? addDays(dueDateFor(date, dueDay), 1) : date
}

export interface PartInterestDue {
  loanPartId: string
  dueCents: Cents
  paidCents: Cents
  differenceCents: Cents
  status: InterestStatus
}

export interface InterestDue {
  /** Rente-periode: vanaf de vorige rentebetaling (of de startdatum) t/m de dag vóór deze betaling. */
  from: ISODate
  to: ISODate
  dueCents: Cents
  /** Betaald − verschuldigd: negatief = te weinig betaald. */
  differenceCents: Cents
  status: InterestStatus
  /** Uitsplitsing per leningdeel (in de volgorde van de delen). */
  parts: PartInterestDue[]
}

/** Opgebouwde rente per leningdeel over een periode. */
function accruedPerPart(
  mortgage: MortgageLike,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  from: ISODate,
  to: ISODate,
): { loanPartId: string; dueCents: Cents }[] {
  const { method } = convention(mortgage)
  const forAccrual = paymentsForAccrual(payments, mortgage)
  return mortgage.parts.map((part) => ({
    loanPartId: part.id,
    dueCents: accruedInterest(
      part.principalCents,
      ratesForPart(rates, part.id),
      paymentsForPart(forAccrual, part.id),
      from,
      to,
      method,
    ),
  }))
}

/**
 * Verschuldigde rente per betaling mét rente (rente wordt achteraf betaald: de termijn
 * van 1 november betaalt de rente over oktober). Een betaling met rente op welk deel dan
 * ook sluit de rente-periode voor álle delen af; zo valt een vergeten deel direct op.
 * Betalingen zonder rente (bijv. een extra aflossing) verlagen alleen het saldo.
 */
export function interestDueByPayment(
  mortgage: MortgageLike,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
): Map<string, InterestDue> {
  const result = new Map<string, InterestDue>()
  let from = mortgage.startDate
  for (const p of sortPaymentsChronologically(payments)) {
    if (p.interestCents <= 0) continue
    const to = periodEnd(p.date, mortgage)
    const parts = accruedPerPart(mortgage, rates, payments, from, to).map(
      ({ loanPartId, dueCents }) => {
        const paidCents = p.lines.find((l) => l.loanPartId === loanPartId)?.interestCents ?? 0
        const differenceCents = paidCents - dueCents
        return {
          loanPartId,
          dueCents,
          paidCents,
          differenceCents,
          status: interestStatus(differenceCents),
        }
      },
    )
    const dueCents = sumCents(parts.map((x) => x.dueCents))
    const differenceCents = p.interestCents - dueCents
    result.set(p.id, {
      from,
      to,
      dueCents,
      differenceCents,
      status: interestStatus(differenceCents),
      parts,
    })
    from = maxDate(from, nextPeriodStart(p.date, mortgage))
  }
  return result
}

export interface DueForDate {
  from: ISODate
  to: ISODate
  dueCents: Cents
  parts: { loanPartId: string; dueCents: Cents }[]
}

/**
 * Verschuldigde rente voor een (nieuwe of bewerkte) betaling op `date`: de periode sinds
 * de laatste rentebetaling vóór die datum, per leningdeel. `excludeId` = de betaling die
 * bewerkt wordt.
 */
export function dueInterestForPaymentDate(
  mortgage: MortgageLike,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  date: ISODate,
  excludeId: string | null = null,
): DueForDate {
  const others = payments.filter((p) => p.id !== excludeId)
  const previous = others
    .filter((p) => p.interestCents > 0 && p.date < date)
    .reduce<ISODate | null>((max, p) => (max === null || p.date > max ? p.date : max), null)
  const from = previous
    ? maxDate(nextPeriodStart(previous, mortgage), mortgage.startDate)
    : mortgage.startDate
  const to = periodEnd(date, mortgage)
  const parts = accruedPerPart(mortgage, rates, others, from, to)
  return { from, to, dueCents: sumCents(parts.map((x) => x.dueCents)), parts }
}

/** Rente die sinds de laatste rentebetaling is opgebouwd (t/m `today`) en nog betaald moet worden. */
export function pendingInterest(
  mortgage: MortgageLike,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  today: ISODate,
): { from: ISODate; to: ISODate; dueCents: Cents } {
  const last = payments
    .filter((p) => p.interestCents > 0 && p.date <= today)
    .reduce<ISODate | null>((max, p) => (max === null || p.date > max ? p.date : max), null)
  const from = last ? nextPeriodStart(last, mortgage) : mortgage.startDate
  const parts = accruedPerPart(mortgage, rates, payments, from, today)
  return { from, to: today, dueCents: sumCents(parts.map((x) => x.dueCents)) }
}

export interface InterestCheckTotals {
  paidCents: Cents
  dueCents: Cents
  differenceCents: Cents
  status: InterestStatus
  /** Aantal betalingen waarbij het verschil groter is dan de marge. */
  deviations: number
}

/** Telt de rentecontrole op over een selectie betalingen (bijv. de gekozen periode). */
export function summarizeInterestCheck(
  payments: readonly Payment[],
  due: ReadonlyMap<string, InterestDue>,
): InterestCheckTotals {
  let paidCents = 0
  let dueCents = 0
  let deviations = 0
  for (const p of payments) {
    const d = due.get(p.id)
    if (!d) continue
    paidCents += p.interestCents
    dueCents += d.dueCents
    if (d.status !== 'ok') deviations++
  }
  const differenceCents = paidCents - dueCents
  return {
    paidCents,
    dueCents,
    differenceCents,
    status: interestStatus(differenceCents),
    deviations,
  }
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
  mortgage: MortgageLike,
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
    let theoretical: Cents | null = null
    for (const part of mortgage.parts) {
      const rate = rateAt(ratesForPart(rates, part.id), reference)
      if (!rate) continue
      const outstanding = outstandingBefore(
        part.principalCents,
        paymentsForPart(payments, part.id),
        reference,
      )
      theoretical = (theoretical ?? 0) + theoreticalMonthlyInterest(outstanding, rate.rateMilliPct)
    }
    return {
      month,
      interestCents: sumCents(ofMonth.map((p) => p.interestCents)),
      principalCents: sumCents(ofMonth.map((p) => p.principalCents)),
      theoreticalInterestCents: theoretical,
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
  /** Verschuldigde rente van de rentebetalingen in dit jaar (zie `interestDueByPayment`). */
  dueInterestCents: Cents
}

/** Per kalenderjaar, van het startjaar t/m het laatste jaar met data (of het huidige jaar). Nieuwste eerst. */
export function yearOverview(
  mortgage: MortgageLike,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  today: ISODate,
): YearSummary[] {
  const due = interestDueByPayment(mortgage, rates, payments)
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
      dueInterestCents: summarizeInterestCheck(
        payments.filter((p) => isInRange(p.date, { from: yearStart, to: yearEnd })),
        due,
      ).dueCents,
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
            dueInterestCents: existing.dueInterestCents + row.dueInterestCents,
          }
        : { ...row },
    )
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

// ---------------------------------------------------------------------------
// Samenvatting per hypotheek (voor kaarten en kerncijfers)
// ---------------------------------------------------------------------------

export interface PartSummary {
  part: LoanPart
  /** Openstaand op `balanceDate` (eind van de periode of vandaag). */
  outstandingCents: Cents
  /** Openstaand vandaag. */
  currentOutstandingCents: Cents
  currentRate: InterestRatePeriod | null
  shareRepaid: number
  /** Theoretische rente voor de huidige maand: huidig saldo × huidig percentage / 12. */
  theoreticalMonthlyInterestCents: Cents | null
}

export interface MortgageSummary {
  principalCents: Cents
  /** Openstaand aan het eind van de periode (of vandaag, als de periode doorloopt). */
  outstandingCents: Cents
  balanceDate: ISODate
  /** Huidig percentage; bij meerdere leningdelen gewogen naar het huidige saldo per deel. */
  currentRateMilliPct: MilliPercent | null
  /** Laagste en hoogste huidige percentage (bij één deel gelijk). */
  rateRange: { min: MilliPercent; max: MilliPercent } | null
  shareRepaid: number
  period: Totals
  allTime: Totals
  /** Theoretische rente voor de huidige maand, opgeteld over de delen. */
  theoreticalMonthlyInterestCents: Cents | null
  parts: PartSummary[]
}

export function summarizeMortgage(
  mortgage: MortgageLike,
  rates: readonly InterestRatePeriod[],
  payments: readonly Payment[],
  range: DateRange,
  today: ISODate,
): MortgageSummary {
  const balanceDate = range.to ? minDate(range.to, today) : today
  // Voor een periode die in de toekomst doorloopt tellen we ook vooruitgeboekte betalingen niet mee.
  const outstandingCents = outstandingAt(mortgage.principalCents, payments, balanceDate)

  const parts: PartSummary[] = mortgage.parts.map((part) => {
    const partPayments = paymentsForPart(payments, part.id)
    const currentRate = rateAt(ratesForPart(rates, part.id), today)
    const partOutstanding = outstandingAt(part.principalCents, partPayments, balanceDate)
    const currentOutstandingCents = outstandingAt(part.principalCents, partPayments, today)
    return {
      part,
      outstandingCents: partOutstanding,
      currentOutstandingCents,
      currentRate,
      shareRepaid: shareRepaid(part.principalCents, partOutstanding),
      theoreticalMonthlyInterestCents: currentRate
        ? theoreticalMonthlyInterest(currentOutstandingCents, currentRate.rateMilliPct)
        : null,
    }
  })

  const withRate = parts.filter((p) => p.currentRate !== null)
  const anyOutstanding = withRate.some((p) => p.currentOutstandingCents > 0)
  const currentRateMilliPct = weightedRate(
    withRate.map((p) => ({
      rateMilliPct: p.currentRate!.rateMilliPct,
      weightCents: anyOutstanding ? Math.max(0, p.currentOutstandingCents) : p.part.principalCents,
    })),
  )
  const rateValues = withRate.map((p) => p.currentRate!.rateMilliPct)

  return {
    principalCents: mortgage.principalCents,
    outstandingCents,
    balanceDate,
    currentRateMilliPct,
    rateRange: rateValues.length
      ? { min: Math.min(...rateValues), max: Math.max(...rateValues) }
      : null,
    shareRepaid: shareRepaid(mortgage.principalCents, outstandingCents),
    period: totalsInRange(payments, range),
    allTime: totalsInRange(payments),
    theoreticalMonthlyInterestCents: withRate.length
      ? sumCents(withRate.map((p) => p.theoreticalMonthlyInterestCents ?? 0))
      : null,
    parts,
  }
}
