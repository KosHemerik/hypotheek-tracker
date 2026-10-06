import type { ISODate, MilliPercent, UUID } from '@/domain/types'
import { addMonths, parseISODate, todayISO, toISODate } from '@/lib/dates'
import { roundDiv } from '@/lib/money'
import type { MortgageRepository } from './MortgageRepository'

/**
 * Realistische voorbeelddata: twee leningdelen met rentewijzigingen en 12 maanden
 * betalingen, relatief aan vandaag zodat de periodefilters altijd iets laten zien.
 *
 * Welke hypotheken voorbeelddata zijn, houden we bij in een losse lijst met id's
 * (niet in het datamodel), zodat "wissen" je eigen gegevens nooit raakt.
 */

const SEED_IDS_KEY = 'hypotheek-tracker:seed-mortgage-ids'
const SEEDED_ONCE_KEY = 'hypotheek-tracker:seeded-once'

function readSeedIds(): UUID[] {
  try {
    return JSON.parse(localStorage.getItem(SEED_IDS_KEY) ?? '[]') as UUID[]
  } catch {
    return []
  }
}

function writeSeedIds(ids: UUID[]) {
  try {
    if (ids.length) localStorage.setItem(SEED_IDS_KEY, JSON.stringify(ids))
    else localStorage.removeItem(SEED_IDS_KEY)
  } catch {
    // Niet fataal: hooguit kan de wis-knop de voorbeelddata dan niet herkennen.
  }
}

export function getSeedMortgageIds(): UUID[] {
  return readSeedIds()
}

/** Laadt de voorbeelddata automatisch bij het allereerste gebruik. */
export function shouldAutoSeed(): boolean {
  try {
    return localStorage.getItem(SEEDED_ONCE_KEY) === null
  } catch {
    return false
  }
}

function markSeededOnce() {
  try {
    localStorage.setItem(SEEDED_ONCE_KEY, new Date().toISOString())
  } catch {
    // negeren
  }
}

interface SeedLoan {
  name: string
  mortgageNumber: string
  principalCents: number
  termMonths: number
  type: 'annuity' | 'linear'
  /** Maandoffsets t.o.v. de startmaand → percentage. Offset 0 = vanaf startdatum. */
  rates: { offset: number; rateMilliPct: MilliPercent }[]
  /** Extra aflossingen: maandoffset → bedrag. */
  extra: { offset: number; principalCents: number }[]
  notes: string
}

const LOANS: SeedLoan[] = [
  {
    name: 'Woning – annuïtair deel',
    mortgageNumber: 'HYP-2481-7730-01',
    principalCents: 285_000_00,
    termMonths: 360,
    type: 'annuity',
    rates: [
      { offset: 0, rateMilliPct: 3920 },
      // Lagere risicoklasse na herwaardering (WOZ omhoog).
      { offset: 7, rateMilliPct: 3720 },
    ],
    extra: [{ offset: 5, principalCents: 5_000_00 }],
    notes: '10 jaar rentevast. Jaarlijks 10% boetevrij extra aflossen.',
  },
  {
    name: 'Woning – lineair deel (variabel)',
    mortgageNumber: 'HYP-2481-7730-02',
    principalCents: 65_000_00,
    termMonths: 360,
    type: 'linear',
    rates: [
      { offset: 0, rateMilliPct: 4450 },
      { offset: 4, rateMilliPct: 4300 },
      { offset: 9, rateMilliPct: 4150 },
    ],
    extra: [],
    notes: 'Variabele rente, maandelijks aanpasbaar.',
  },
]

/** Annuïteit in centen: P·r / (1 − (1+r)^−n). Alleen voor het genereren van voorbeelddata. */
function annuityCents(principalCents: number, rateMilliPct: number, months: number): number {
  const r = rateMilliPct / 100_000 / 12
  if (r === 0) return Math.round(principalCents / months)
  return Math.round((principalCents * r) / (1 - (1 + r) ** -months))
}

export async function loadSampleData(repo: MortgageRepository, today: ISODate = todayISO()) {
  const { year, month } = parseISODate(today)
  // Start op de 15e, 12 maanden geleden; termijnen op de 1e van elke maand daarna (t/m deze maand).
  const startDate = addMonths(toISODate(year, month, 15), -12)
  const startMonth = toISODate(year, month, 1)
  const monthStart = (offset: number) => addMonths(startMonth, offset - 12)
  const createdIds: UUID[] = []

  for (const loan of LOANS) {
    const endDate = addMonths(startDate, loan.termMonths)
    const firstRate = loan.rates[0]!
    const mortgage = await repo.createMortgage({
      name: loan.name,
      mortgageNumber: loan.mortgageNumber,
      principalCents: loan.principalCents,
      startDate,
      endDate,
      notes: loan.notes,
      initialRateMilliPct: firstRate.rateMilliPct,
    })
    createdIds.push(mortgage.id)

    const rateDates = loan.rates.map((r) => ({
      ...r,
      date: r.offset === 0 ? startDate : monthStart(r.offset),
    }))
    for (const r of rateDates.slice(1)) {
      await repo.createRate({
        mortgageId: mortgage.id,
        rateMilliPct: r.rateMilliPct,
        effectiveDate: r.date,
      })
    }

    let balance = loan.principalCents
    let currentRate = firstRate.rateMilliPct
    let monthly = loan.type === 'annuity' ? annuityCents(balance, currentRate, loan.termMonths) : 0
    const linearPart = roundDiv(loan.principalCents, loan.termMonths)

    for (let i = 1; i <= 12; i++) {
      const date = monthStart(i)
      if (date > today) break
      // Rente over de afgelopen maand, tegen het percentage dat aan het begin van die maand gold.
      const periodStart = monthStart(i - 1)
      const applicable =
        [...rateDates].reverse().find((r) => r.date <= periodStart) ?? rateDates[0]!
      if (applicable.rateMilliPct !== currentRate) {
        currentRate = applicable.rateMilliPct
        if (loan.type === 'annuity') {
          monthly = annuityCents(balance, currentRate, loan.termMonths - i + 1)
        }
      }
      const interest = roundDiv(balance * currentRate, 1_200_000)
      const principal = loan.type === 'annuity' ? monthly - interest : linearPart
      balance -= principal
      await repo.createPayment({
        mortgageId: mortgage.id,
        date,
        interestCents: interest,
        principalCents: principal,
        description: 'Maandtermijn',
      })

      for (const extra of loan.extra.filter((e) => e.offset === i)) {
        balance -= extra.principalCents
        await repo.createPayment({
          mortgageId: mortgage.id,
          date: `${date.slice(0, 7)}-20`,
          interestCents: 0,
          principalCents: extra.principalCents,
          description: 'Extra aflossing (boetevrij)',
        })
        if (loan.type === 'annuity') {
          monthly = annuityCents(balance, currentRate, loan.termMonths - i)
        }
      }
    }
  }

  writeSeedIds([...readSeedIds(), ...createdIds])
  markSeededOnce()
}

export async function clearSampleData(repo: MortgageRepository) {
  for (const id of readSeedIds()) {
    await repo.deleteMortgage(id)
  }
  writeSeedIds([])
  markSeededOnce()
}

/** Na het verwijderen van een hypotheek: uit de voorbeeldlijst halen. */
export function forgetSeedMortgage(id: UUID) {
  writeSeedIds(readSeedIds().filter((x) => x !== id))
}
