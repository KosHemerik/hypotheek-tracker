import { describe, expect, it } from 'vitest'
import {
  balanceSeries,
  combineYearOverviews,
  isInRange,
  monthlyBreakdown,
  outstandingAt,
  outstandingBefore,
  paymentsWithBalance,
  rateAt,
  shareRepaid,
  sortPaymentsChronologically,
  summarizeMortgage,
  theoreticalMonthlyInterest,
  totalRepaidUpTo,
  totalsInRange,
  yearOverview,
} from './calculations'
import { makeMortgage, makePayment, makeRate } from './test-utils'

const mortgage = makeMortgage({ principalCents: 100_000_00, startDate: '2024-01-15' })
const payments = [
  makePayment({ date: '2024-02-01', interestCents: 250_00, principalCents: 200_00 }),
  makePayment({ date: '2024-03-01', interestCents: 249_50, principalCents: 200_50 }),
  makePayment({
    date: '2024-03-15',
    interestCents: 0,
    principalCents: 5_000_00,
    description: 'Extra',
  }),
  makePayment({ date: '2025-01-01', interestCents: 230_00, principalCents: 220_00 }),
]

describe('isInRange', () => {
  it('is inclusief aan beide kanten en onbegrensd bij null', () => {
    expect(isInRange('2024-01-01', { from: '2024-01-01', to: '2024-01-31' })).toBe(true)
    expect(isInRange('2024-01-31', { from: '2024-01-01', to: '2024-01-31' })).toBe(true)
    expect(isInRange('2024-02-01', { from: '2024-01-01', to: '2024-01-31' })).toBe(false)
    expect(isInRange('1999-01-01', { from: null, to: null })).toBe(true)
  })
})

describe('outstandingAt', () => {
  it('trekt alle aflossingen t/m de datum af van de hoofdsom', () => {
    expect(outstandingAt(mortgage.principalCents, payments, '2024-01-31')).toBe(100_000_00)
    expect(outstandingAt(mortgage.principalCents, payments, '2024-02-01')).toBe(99_800_00)
    expect(outstandingAt(mortgage.principalCents, payments, '2024-03-15')).toBe(94_599_50)
    expect(outstandingAt(mortgage.principalCents, payments)).toBe(94_379_50)
  })

  it('negeert rente bij het saldo', () => {
    const onlyInterest = [makePayment({ interestCents: 500_00, principalCents: 0 })]
    expect(outstandingAt(1_000_00, onlyInterest)).toBe(1_000_00)
  })

  it('outstandingBefore telt betalingen op de dag zelf niet mee', () => {
    expect(outstandingBefore(mortgage.principalCents, payments, '2024-02-01')).toBe(100_000_00)
    expect(outstandingBefore(mortgage.principalCents, payments, '2024-02-02')).toBe(99_800_00)
  })

  it('totalRepaidUpTo telt exact in centen (geen float-fouten)', () => {
    const many = Array.from({ length: 10 }, () => makePayment({ principalCents: 10 })) // 10× € 0,10
    expect(totalRepaidUpTo(many)).toBe(100)
  })
})

describe('rateAt', () => {
  const rates = [
    makeRate({ effectiveDate: '2024-06-01', rateMilliPct: 3500 }),
    makeRate({ effectiveDate: '2024-01-15', rateMilliPct: 4000 }),
    makeRate({ effectiveDate: '2025-01-01', rateMilliPct: 3250 }),
  ]

  it('kiest het percentage met de laatste ingangsdatum op of vóór de datum', () => {
    expect(rateAt(rates, '2024-01-15')?.rateMilliPct).toBe(4000)
    expect(rateAt(rates, '2024-05-31')?.rateMilliPct).toBe(4000)
    expect(rateAt(rates, '2024-06-01')?.rateMilliPct).toBe(3500)
    expect(rateAt(rates, '2030-01-01')?.rateMilliPct).toBe(3250)
  })

  it('geeft null vóór de eerste ingangsdatum of zonder percentages', () => {
    expect(rateAt(rates, '2024-01-14')).toBeNull()
    expect(rateAt([], '2024-01-14')).toBeNull()
  })
})

describe('theoreticalMonthlyInterest', () => {
  it('berekent openstaand × percentage / 12', () => {
    // € 250.000 × 3,6% / 12 = € 750,00
    expect(theoreticalMonthlyInterest(250_000_00, 3600)).toBe(750_00)
    // € 100.000 × 3,85% / 12 = € 320,8333… → € 320,83
    expect(theoreticalMonthlyInterest(100_000_00, 3850)).toBe(320_83)
  })

  it('rondt half naar boven af op centen', () => {
    // 1 cent × 6% / 12 = 0,005 cent → 0; 100 cent × 6% / 12 = 0,5 cent → 1
    expect(theoreticalMonthlyInterest(1, 6000)).toBe(0)
    expect(theoreticalMonthlyInterest(100, 6000)).toBe(1)
  })

  it('is 0 bij 0% of 0 saldo', () => {
    expect(theoreticalMonthlyInterest(250_000_00, 0)).toBe(0)
    expect(theoreticalMonthlyInterest(0, 4000)).toBe(0)
  })
})

describe('shareRepaid', () => {
  it('geeft een fractie tussen 0 en 1', () => {
    expect(shareRepaid(100_00, 75_00)).toBe(0.25)
    expect(shareRepaid(100_00, 0)).toBe(1)
    expect(shareRepaid(0, 0)).toBe(0)
  })
})

describe('totalsInRange', () => {
  it('telt rente en aflossing binnen de periode', () => {
    expect(totalsInRange(payments, { from: '2024-03-01', to: '2024-12-31' })).toEqual({
      interestCents: 249_50,
      principalCents: 5_200_50,
      totalCents: 5_450_00,
      count: 2,
    })
  })

  it('telt alles zonder periode', () => {
    const totals = totalsInRange(payments)
    expect(totals.interestCents).toBe(729_50)
    expect(totals.principalCents).toBe(5_620_50)
    expect(totals.count).toBe(4)
  })
})

describe('sortPaymentsChronologically / paymentsWithBalance', () => {
  it('sorteert op datum en bij gelijke datum op aanmaakmoment', () => {
    const a = makePayment({ date: '2024-05-01', createdAt: '2024-05-01T10:00:00Z' })
    const b = makePayment({ date: '2024-05-01', createdAt: '2024-05-01T09:00:00Z' })
    const c = makePayment({ date: '2024-04-01', createdAt: '2024-06-01T00:00:00Z' })
    expect(sortPaymentsChronologically([a, b, c]).map((p) => p.id)).toEqual([c.id, b.id, a.id])
  })

  it('berekent het saldo na elke betaling', () => {
    const shuffled = [payments[3]!, payments[0]!, payments[2]!, payments[1]!]
    const rows = paymentsWithBalance(mortgage.principalCents, shuffled)
    expect(rows.map((r) => r.balanceAfterCents)).toEqual([
      99_800_00, 99_599_50, 94_599_50, 94_379_50,
    ])
    expect(rows[0]!.totalCents).toBe(450_00)
  })
})

describe('balanceSeries', () => {
  it('begint op de startdatum met de hoofdsom en volgt de betalingen', () => {
    const series = balanceSeries(mortgage, payments, { from: null, to: null }, '2025-02-10')
    expect(series[0]).toEqual({ date: '2024-01-15', balanceCents: 100_000_00 })
    expect(series.map((p) => p.date)).toEqual([
      '2024-01-15',
      '2024-02-01',
      '2024-03-01',
      '2024-03-15',
      '2025-01-01',
      '2025-02-10',
    ])
    expect(series.at(-1)!.balanceCents).toBe(94_379_50)
  })

  it('begint bij een periode met het saldo aan het begin van die periode', () => {
    const series = balanceSeries(
      mortgage,
      payments,
      { from: '2024-03-01', to: '2024-03-31' },
      '2025-02-10',
    )
    expect(series).toEqual([
      { date: '2024-03-01', balanceCents: 99_599_50 },
      { date: '2024-03-15', balanceCents: 94_599_50 },
      { date: '2024-03-31', balanceCents: 94_599_50 },
    ])
  })

  it('is leeg als de periode vóór de startdatum eindigt', () => {
    expect(
      balanceSeries(mortgage, payments, { from: '2020-01-01', to: '2020-12-31' }, '2025-01-01'),
    ).toEqual([])
  })
})

describe('monthlyBreakdown', () => {
  const rates = [
    makeRate({ effectiveDate: '2024-01-15', rateMilliPct: 3000 }),
    makeRate({ effectiveDate: '2024-03-01', rateMilliPct: 2400 }),
  ]

  it('geeft per maand rente, aflossing en theoretische rente, inclusief lege maanden', () => {
    const rows = monthlyBreakdown(
      mortgage,
      rates,
      payments,
      { from: '2024-01-01', to: '2024-04-30' },
      '2025-01-01',
    )
    expect(rows.map((r) => r.month)).toEqual(['2024-01', '2024-02', '2024-03', '2024-04'])
    // Januari: start halverwege; referentie = startdatum, saldo 100.000 × 3% / 12 = 250
    expect(rows[0]).toEqual({
      month: '2024-01',
      interestCents: 0,
      principalCents: 0,
      theoreticalInterestCents: 250_00,
    })
    expect(rows[1]).toMatchObject({
      interestCents: 250_00,
      principalCents: 200_00,
      theoreticalInterestCents: 250_00,
    })
    // Maart: saldo begin maand 99.800 × 2,4% / 12 = 199,60 (wijziging gaat precies op 1 maart in)
    expect(rows[2]).toMatchObject({
      interestCents: 249_50,
      principalCents: 5_200_50,
      theoreticalInterestCents: 199_60,
    })
    // April: saldo 94.599,50 × 2,4% / 12 = 189,199 → 189,20
    expect(rows[3]).toMatchObject({
      interestCents: 0,
      principalCents: 0,
      theoreticalInterestCents: 189_20,
    })
  })
})

describe('yearOverview', () => {
  it('geeft per jaar rente, aflossing en saldo begin/eind, nieuwste eerst', () => {
    const rows = yearOverview(mortgage, payments, '2025-06-01')
    expect(rows).toEqual([
      {
        year: 2025,
        interestCents: 230_00,
        principalCents: 220_00,
        openingBalanceCents: 94_599_50,
        closingBalanceCents: 94_379_50,
        paymentCount: 1,
      },
      {
        year: 2024,
        interestCents: 499_50,
        principalCents: 5_400_50,
        openingBalanceCents: 100_000_00,
        closingBalanceCents: 94_599_50,
        paymentCount: 3,
      },
    ])
  })

  it('telt jaren van meerdere hypotheken op', () => {
    const other = makeMortgage({ principalCents: 50_000_00, startDate: '2025-01-01' })
    const combined = combineYearOverviews([
      yearOverview(mortgage, payments, '2025-06-01'),
      yearOverview(
        other,
        [makePayment({ date: '2025-02-01', interestCents: 100_00, principalCents: 1_000_00 })],
        '2025-06-01',
      ),
    ])
    expect(combined[0]).toMatchObject({
      year: 2025,
      interestCents: 330_00,
      principalCents: 1_220_00,
      openingBalanceCents: 144_599_50,
      closingBalanceCents: 143_379_50,
    })
    expect(combined[1]).toMatchObject({ year: 2024, openingBalanceCents: 100_000_00 })
  })
})

describe('summarizeMortgage', () => {
  const rates = [
    makeRate({ effectiveDate: '2024-01-15', rateMilliPct: 3000 }),
    makeRate({ effectiveDate: '2025-01-01', rateMilliPct: 2400 }),
  ]

  it('gebruikt het saldo aan het eind van de periode en het huidige percentage', () => {
    const summary = summarizeMortgage(
      mortgage,
      rates,
      payments,
      { from: '2024-01-01', to: '2024-12-31' },
      '2025-06-01',
    )
    expect(summary.outstandingCents).toBe(94_599_50)
    expect(summary.balanceDate).toBe('2024-12-31')
    expect(summary.currentRate?.rateMilliPct).toBe(2400)
    expect(summary.period.principalCents).toBe(5_400_50)
    expect(summary.allTime.principalCents).toBe(5_620_50)
    // Huidig saldo 94.379,50 × 2,4% / 12 = 188,759 → 188,76
    expect(summary.theoreticalMonthlyInterestCents).toBe(188_76)
  })

  it('telt toekomstige betalingen niet mee in het huidige saldo', () => {
    const future = [...payments, makePayment({ date: '2026-01-01', principalCents: 1_000_00 })]
    const summary = summarizeMortgage(
      mortgage,
      rates,
      future,
      { from: null, to: null },
      '2025-06-01',
    )
    expect(summary.outstandingCents).toBe(94_379_50)
  })
})
