import type { ISODate, MilliPercent, UUID } from '@/domain/types'
import { accruedInterest } from '@/lib/calculations'
import { addDays, addMonths, parseISODate, todayISO, toISODate } from '@/lib/dates'
import { roundDiv } from '@/lib/money'
import type { MortgageRepository } from './MortgageRepository'

/**
 * Realistische voorbeelddata: één hypotheek met twee leningdelen, rentewijzigingen en 12 maanden
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

interface SeedPart {
  name: string
  principalCents: number
  termMonths: number
  type: 'annuity' | 'linear'
  /** Maandoffsets t.o.v. de startmaand → percentage. Offset 0 = vanaf startdatum. */
  rates: { offset: number; rateMilliPct: MilliPercent }[]
  /** Extra aflossingen: maandoffset → bedrag. */
  extra: { offset: number; principalCents: number }[]
}

/** Eén woninghypotheek met twee leningdelen, elk met een eigen rente. */
const SAMPLE = {
  name: 'Woning Amersfoort',
  mortgageNumber: 'HYP-2481-7730',
  termMonths: 360,
  notes:
    'Deel 1: 10 jaar rentevast, jaarlijks 10% boetevrij extra aflossen. Deel 2: variabele rente, maandelijks aanpasbaar.',
  parts: [
    {
      name: 'Deel 1 – annuïtair',
      principalCents: 285_000_00,
      termMonths: 360,
      type: 'annuity',
      rates: [
        { offset: 0, rateMilliPct: 3920 },
        // Lagere risicoklasse na herwaardering (WOZ omhoog).
        { offset: 7, rateMilliPct: 3720 },
      ],
      extra: [{ offset: 5, principalCents: 5_000_00 }],
    },
    {
      name: 'Deel 2 – lineair (variabel)',
      principalCents: 65_000_00,
      termMonths: 360,
      type: 'linear',
      rates: [
        { offset: 0, rateMilliPct: 4450 },
        { offset: 4, rateMilliPct: 4300 },
        { offset: 9, rateMilliPct: 4150 },
      ],
      extra: [],
    },
  ] satisfies SeedPart[],
}

/** Annuïteit in centen: P·r / (1 − (1+r)^−n). Alleen voor het genereren van voorbeelddata. */
function annuityCents(principalCents: number, rateMilliPct: number, months: number): number {
  const r = rateMilliPct / 100_000 / 12
  if (r === 0) return Math.round(principalCents / months)
  return Math.round((principalCents * r) / (1 - (1 + r) ** -months))
}

export async function loadSampleData(
  repo: MortgageRepository,
  entityId: UUID,
  today: ISODate = todayISO(),
) {
  const { year, month } = parseISODate(today)
  // Start op de 15e, 12 maanden geleden; termijnen op de 1e van elke maand daarna (t/m deze maand).
  const startDate = addMonths(toISODate(year, month, 15), -12)
  const startMonth = toISODate(year, month, 1)
  const monthStart = (offset: number) => addMonths(startMonth, offset - 12)

  // Lineaire delen hebben een vaste afgesproken aflossing; bij annuïteit wisselt die per maand.
  const linearAmount = (p: SeedPart) => roundDiv(p.principalCents, p.termMonths)
  const mortgage = await repo.createMortgage({
    entityId,
    name: SAMPLE.name,
    mortgageNumber: SAMPLE.mortgageNumber,
    startDate,
    endDate: addMonths(startDate, SAMPLE.termMonths),
    notes: SAMPLE.notes,
    // Voorbeeld-IBAN van de geldverstrekker (geldig controlegetal, geen echte rekening).
    counterpartyIban: 'NL91ABNA0417164300',
    interestMethod: 'actual',
    dueDay: null,
    parts: SAMPLE.parts.map((p) => ({
      name: p.name,
      principalCents: p.principalCents,
      agreedRepaymentCents: p.type === 'linear' ? linearAmount(p) : 0,
      initialRateMilliPct: p.rates[0]!.rateMilliPct,
    })),
  })

  // Per deel: rentewijzigingen en een eigen simulatie van saldo en termijn.
  const states = await Promise.all(
    SAMPLE.parts.map(async (seed, index) => {
      const part = mortgage.parts[index]!
      const rateDates = seed.rates.map((r) => ({
        ...r,
        date: r.offset === 0 ? startDate : monthStart(r.offset),
      }))
      for (const r of rateDates.slice(1)) {
        await repo.createRate({
          mortgageId: mortgage.id,
          loanPartId: part.id,
          rateMilliPct: r.rateMilliPct,
          effectiveDate: r.date,
        })
      }
      const firstRate = seed.rates[0]!.rateMilliPct
      return {
        seed,
        part,
        rateDates,
        // Zelfde rekenmethode als de rentecontrole in de app.
        ratesForCalc: rateDates.map((r) => ({
          effectiveDate: r.date,
          rateMilliPct: r.rateMilliPct,
        })),
        repaid: [] as { date: ISODate; principalCents: number }[],
        balance: seed.principalCents,
        currentRate: firstRate,
        monthly:
          seed.type === 'annuity'
            ? annuityCents(seed.principalCents, firstRate, seed.termMonths)
            : 0,
      }
    }),
  )

  let interestFrom = startDate
  for (let i = 1; i <= 12; i++) {
    const date = monthStart(i)
    if (date > today) break
    const periodStart = monthStart(i - 1)
    const lines = states.map((st) => {
      // Termijn opnieuw berekenen als de rente aan het begin van de maand gewijzigd is.
      const applicable =
        [...st.rateDates].reverse().find((r) => r.date <= periodStart) ?? st.rateDates[0]!
      if (applicable.rateMilliPct !== st.currentRate) {
        st.currentRate = applicable.rateMilliPct
        if (st.seed.type === 'annuity') {
          st.monthly = annuityCents(st.balance, st.currentRate, st.seed.termMonths - i + 1)
        }
      }
      const interest = accruedInterest(
        st.seed.principalCents,
        st.ratesForCalc,
        st.repaid,
        interestFrom,
        addDays(date, -1),
      )
      const principal =
        st.seed.type === 'annuity' ? Math.max(0, st.monthly - interest) : linearAmount(st.seed)
      st.balance -= principal
      st.repaid.push({ date, principalCents: principal })
      return { loanPartId: st.part.id, interestCents: interest, principalCents: principal }
    })
    interestFrom = date
    await repo.createPayment({ mortgageId: mortgage.id, date, description: 'Maandtermijn', lines })

    for (const st of states) {
      for (const extra of st.seed.extra.filter((e) => e.offset === i)) {
        const extraDate = `${date.slice(0, 7)}-20`
        st.balance -= extra.principalCents
        st.repaid.push({ date: extraDate, principalCents: extra.principalCents })
        await repo.createPayment({
          mortgageId: mortgage.id,
          date: extraDate,
          description: 'Extra aflossing (boetevrij)',
          lines: [
            { loanPartId: st.part.id, interestCents: 0, principalCents: extra.principalCents },
          ],
        })
        if (st.seed.type === 'annuity') {
          st.monthly = annuityCents(st.balance, st.currentRate, st.seed.termMonths - i)
        }
      }
    }
  }

  writeSeedIds([...readSeedIds(), mortgage.id])
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
