import { describe, expect, it } from 'vitest'
import {
  accruedInterest,
  days30,
  dueDateFor,
  paymentsForPart,
  weightedRate,
  balanceSeries,
  dueInterestForPaymentDate,
  interestDueByPayment,
  interestStatus,
  pendingInterest,
  summarizeInterestCheck,
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
import { makeMortgage, makePart, makePayment, makeRate } from './test-utils'

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
    const rows = yearOverview(mortgage, [], payments, '2025-06-01')
    expect(rows).toEqual([
      {
        year: 2025,
        interestCents: 230_00,
        principalCents: 220_00,
        openingBalanceCents: 94_599_50,
        closingBalanceCents: 94_379_50,
        paymentCount: 1,
        dueInterestCents: 0,
      },
      {
        year: 2024,
        interestCents: 499_50,
        principalCents: 5_400_50,
        openingBalanceCents: 100_000_00,
        closingBalanceCents: 94_599_50,
        paymentCount: 3,
        dueInterestCents: 0,
      },
    ])
  })

  it('telt jaren van meerdere hypotheken op', () => {
    const other = makeMortgage({ principalCents: 50_000_00, startDate: '2025-01-01' })
    const combined = combineYearOverviews([
      yearOverview(mortgage, [], payments, '2025-06-01'),
      yearOverview(
        other,
        [],
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
    expect(summary.currentRateMilliPct).toBe(2400)
    expect(summary.rateRange).toEqual({ min: 2400, max: 2400 })
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

describe('rentecontrole', () => {
  // € 120.000 tegen 3%: precies € 300,00 rente per volle maand.
  const m = makeMortgage({ principalCents: 120_000_00, startDate: '2025-01-15' })
  const rates = [makeRate({ effectiveDate: '2025-01-15', rateMilliPct: 3000 })]

  describe('accruedInterest', () => {
    it('geeft over een volle maand saldo × % / 12', () => {
      expect(accruedInterest(m.principalCents, rates, [], '2025-02-01', '2025-02-28')).toBe(300_00)
    })

    it('rekent een gebroken maand naar rato van de dagen', () => {
      // 15 t/m 31 januari = 17 van 31 dagen: 300 × 17/31 = 164,516…
      expect(accruedInterest(m.principalCents, rates, [], '2025-01-15', '2025-01-31')).toBe(164_52)
    })

    it('verwerkt een rentewijziging midden in de maand', () => {
      const changed = [...rates, makeRate({ effectiveDate: '2025-03-17', rateMilliPct: 2400 })]
      // 16 dagen à 3% + 15 dagen à 2,4% (240/maand): (300×16 + 240×15) / 31 = 270,967…
      expect(accruedInterest(m.principalCents, changed, [], '2025-03-01', '2025-03-31')).toBe(
        270_97,
      )
    })

    it('verlaagt het saldo vanaf de dag van een aflossing', () => {
      const extra = [makePayment({ date: '2025-04-11', principalCents: 10_000_00 })]
      // 10 dagen op 120k (300/mnd) + 20 dagen op 110k (275/mnd), april heeft 30 dagen
      expect(accruedInterest(m.principalCents, rates, extra, '2025-04-01', '2025-04-30')).toBe(
        283_33,
      )
    })

    it('is 0 voor een lege periode of zonder geldend percentage', () => {
      expect(accruedInterest(m.principalCents, rates, [], '2025-02-01', '2025-01-31')).toBe(0)
      expect(accruedInterest(m.principalCents, [], [], '2025-02-01', '2025-02-28')).toBe(0)
    })
  })

  const payments = [
    makePayment({ id: 'feb', date: '2025-02-01', interestCents: 150_00, principalCents: 200_00 }),
    makePayment({ id: 'mrt', date: '2025-03-01', interestCents: 300_00, principalCents: 200_00 }),
    makePayment({ id: 'extra', date: '2025-03-20', interestCents: 0, principalCents: 10_000_00 }),
    makePayment({ id: 'apr', date: '2025-04-01', interestCents: 300_00, principalCents: 200_00 }),
  ]

  it('interestStatus houdt een marge van € 1 aan', () => {
    expect(interestStatus(-100)).toBe('ok')
    expect(interestStatus(100)).toBe('ok')
    expect(interestStatus(-101)).toBe('under')
    expect(interestStatus(101)).toBe('over')
  })

  it('berekent per rentebetaling de verschuldigde rente over de periode ervoor', () => {
    const due = interestDueByPayment(m, rates, payments)
    // Eerste termijn: 15 t/m 31 januari op 120k.
    expect(due.get('feb')).toMatchObject({
      from: '2025-01-15',
      to: '2025-01-31',
      dueCents: 164_52,
      differenceCents: -14_52,
      status: 'under',
    })
    // Februari op 119.800: 299,50.
    expect(due.get('mrt')).toMatchObject({
      from: '2025-02-01',
      to: '2025-02-28',
      dueCents: 299_50,
      status: 'ok',
    })
    // Extra aflossing zonder rente krijgt geen eigen periode.
    expect(due.has('extra')).toBe(false)
    // Maart: 19 dagen op 119.600 + 12 dagen op 109.600 (na de extra aflossing van 20-03).
    // (299,00 × 19 + 274,00 × 12) / 31 = 289,322…
    expect(due.get('apr')).toMatchObject({
      from: '2025-03-01',
      to: '2025-03-31',
      dueCents: 289_32,
      status: 'over',
    })
  })

  it('telt de controle op over een selectie', () => {
    const due = interestDueByPayment(m, rates, payments)
    expect(summarizeInterestCheck(payments, due)).toEqual({
      paidCents: 750_00,
      dueCents: 164_52 + 299_50 + 289_32,
      differenceCents: 750_00 - (164_52 + 299_50 + 289_32),
      status: 'under',
      deviations: 2,
    })
  })

  it('berekent de verschuldigde rente voor een nieuwe of bewerkte betaling', () => {
    // Nieuwe termijn op 1 mei: april op 109.400 = 273,50.
    expect(dueInterestForPaymentDate(m, rates, payments, '2025-05-01')).toMatchObject({
      from: '2025-04-01',
      to: '2025-04-30',
      dueCents: 273_50,
    })
    // De termijn van 1 april bewerken: periode is weer heel maart.
    expect(dueInterestForPaymentDate(m, rates, payments, '2025-04-01', 'apr').dueCents).toBe(289_32)
  })

  it('geeft de opgebouwde rente sinds de laatste rentebetaling', () => {
    // 1 t/m 15 april op 109.400 (273,50/maand): 273,50 × 15/30 = 136,75.
    expect(pendingInterest(m, rates, payments, '2025-04-15')).toEqual({
      from: '2025-04-01',
      to: '2025-04-15',
      dueCents: 136_75,
    })
  })

  it('neemt de verschuldigde rente op in het jaaroverzicht', () => {
    const [y2025] = yearOverview(m, rates, payments, '2025-06-01')
    expect(y2025).toMatchObject({ year: 2025, interestCents: 750_00, dueInterestCents: 753_34 })
  })
})

describe('meerdere leningdelen', () => {
  // Deel A: € 100.000 à 3% (€ 250/mnd), deel B: € 50.000 à 6% (€ 250/mnd).
  const m = makeMortgage({
    startDate: '2025-01-01',
    parts: [
      makePart({ id: 'A', name: 'Deel A', principalCents: 100_000_00 }),
      makePart({ id: 'B', name: 'Deel B', principalCents: 50_000_00 }),
    ],
  })
  const rates = [
    makeRate({ loanPartId: 'A', effectiveDate: '2025-01-01', rateMilliPct: 3000 }),
    makeRate({ loanPartId: 'B', effectiveDate: '2025-01-01', rateMilliPct: 6000 }),
  ]
  const payments = [
    makePayment({
      id: 'feb',
      date: '2025-02-01',
      lines: [
        { loanPartId: 'A', interestCents: 250_00, principalCents: 1_000_00 },
        { loanPartId: 'B', interestCents: 250_00, principalCents: 0 },
      ],
    }),
    // Deel B vergeten in maart.
    makePayment({
      id: 'mrt',
      date: '2025-03-01',
      lines: [{ loanPartId: 'A', interestCents: 247_50, principalCents: 1_000_00 }],
    }),
  ]

  it('telt de hoofdsom en betalingen per deel op', () => {
    expect(m.principalCents).toBe(150_000_00)
    expect(payments[0]!.interestCents).toBe(500_00)
    expect(paymentsForPart(payments, 'B').map((p) => p.interestCents)).toEqual([250_00, 0])
  })

  it('berekent de rentecontrole per deel en signaleert een vergeten deel', () => {
    const due = interestDueByPayment(m, rates, payments)
    expect(due.get('feb')).toMatchObject({ dueCents: 500_00, status: 'ok' })
    const mrt = due.get('mrt')!
    // A: februari op 99.000 = 247,50; B: februari op 50.000 = 250,00.
    expect(mrt.dueCents).toBe(497_50)
    expect(mrt.differenceCents).toBe(-250_00)
    expect(mrt.status).toBe('under')
    expect(mrt.parts).toEqual([
      { loanPartId: 'A', dueCents: 247_50, paidCents: 247_50, differenceCents: 0, status: 'ok' },
      {
        loanPartId: 'B',
        dueCents: 250_00,
        paidCents: 0,
        differenceCents: -250_00,
        status: 'under',
      },
    ])
  })

  it('geeft een gewogen huidig percentage, de bandbreedte en theoretische rente', () => {
    const summary = summarizeMortgage(m, rates, payments, { from: null, to: null }, '2025-03-15')
    expect(summary.outstandingCents).toBe(148_000_00)
    // (3% × 98.000 + 6% × 50.000) / 148.000 = 4,0135%
    expect(summary.currentRateMilliPct).toBe(4014)
    expect(summary.rateRange).toEqual({ min: 3000, max: 6000 })
    // 98.000 × 3% / 12 + 50.000 × 6% / 12 = 245 + 250
    expect(summary.theoreticalMonthlyInterestCents).toBe(495_00)
    expect(summary.parts.map((p) => p.outstandingCents)).toEqual([98_000_00, 50_000_00])
  })

  it('splitst de verschuldigde rente voor een nieuwe betaling per deel', () => {
    expect(dueInterestForPaymentDate(m, rates, payments, '2025-04-01')).toEqual({
      from: '2025-03-01',
      to: '2025-03-31',
      dueCents: 495_00,
      parts: [
        { loanPartId: 'A', dueCents: 245_00 },
        { loanPartId: 'B', dueCents: 250_00 },
      ],
    })
  })

  it('telt de theoretische rente per maand over de delen op', () => {
    const rows = monthlyBreakdown(
      m,
      rates,
      payments,
      { from: '2025-03-01', to: '2025-03-31' },
      '2025-04-01',
    )
    expect(rows[0]!.theoreticalInterestCents).toBe(497_50)
  })

  it('weightedRate', () => {
    expect(weightedRate([])).toBeNull()
    expect(
      weightedRate([
        { rateMilliPct: 3000, weightCents: 0 },
        { rateMilliPct: 5000, weightCents: 0 },
      ]),
    ).toBe(4000)
    expect(
      weightedRate([
        { rateMilliPct: 3000, weightCents: 300 },
        { rateMilliPct: 6000, weightCents: 100 },
      ]),
    ).toBe(3750)
  })
})

describe('30/360 met vervaldag (Build Finance)', () => {
  // Lening "Build" (400000564): start 5 feb 2026, vier delen, vervaldag de 25e.
  const parts = [
    makePart({ id: '001', principalCents: 794_100_00 }),
    makePart({ id: '002', principalCents: 125_000_00, agreedRepaymentCents: 698_32 }),
    makePart({ id: '003', principalCents: 338_600_00 }),
    makePart({ id: '004', principalCents: 95_000_00, agreedRepaymentCents: 530_72 }),
  ]
  const m = makeMortgage({
    startDate: '2026-02-05',
    parts,
    interestMethod: 'thirty_360',
    dueDay: 25,
  })
  const rates = [
    makeRate({ loanPartId: '001', effectiveDate: '2026-02-05', rateMilliPct: 4900 }),
    makeRate({ loanPartId: '002', effectiveDate: '2026-02-05', rateMilliPct: 4900 }),
    makeRate({ loanPartId: '003', effectiveDate: '2026-02-05', rateMilliPct: 5150 }),
    makeRate({ loanPartId: '004', effectiveDate: '2026-02-05', rateMilliPct: 5150 }),
  ]
  const termijn = (id: string, date: string, interest: number[]) =>
    makePayment({
      id,
      date,
      lines: [
        { loanPartId: '001', interestCents: interest[0]!, principalCents: 0 },
        { loanPartId: '002', interestCents: interest[1]!, principalCents: 698_32 },
        { loanPartId: '003', interestCents: interest[2]!, principalCents: 0 },
        { loanPartId: '004', interestCents: interest[3]!, principalCents: 530_72 },
      ],
    })

  it('days30 telt elke maand als 30 dagen', () => {
    expect(days30(15, 31)).toBe(1)
    expect(days30(31, 31)).toBe(0)
    expect(days30(28, 28)).toBe(3)
    expect(days30(29, 29)).toBe(2)
    expect(days30(30, 30)).toBe(1)
  })

  it('koppelt een incasso aan de vervaldag (ook als die door het weekend later valt)', () => {
    expect(dueDateFor('2026-03-25', 25)).toBe('2026-03-25')
    expect(dueDateFor('2026-04-27', 25)).toBe('2026-04-25')
    expect(dueDateFor('2026-04-23', 25)).toBe('2026-04-25') // vlak vóór de vervaldag
    expect(dueDateFor('2026-04-10', 25)).toBe('2026-03-25')
    expect(dueDateFor('2026-02-27', 30)).toBe('2026-02-28') // vervaldag bestaat niet in februari
  })

  it('eerste termijn (25-03-2026): 1,7 maand rente = precies het bedrag van de bank', () => {
    const due = dueInterestForPaymentDate(m, rates, [], '2026-03-25')
    expect(due.from).toBe('2026-02-05')
    expect(due.to).toBe('2026-03-25')
    expect(due.parts.map((p) => p.dueCents)).toEqual([5_512_38, 867_71, 2_470_37, 693_10])
    // Rente 9.543,56 + aflossing 1.229,04 = 10.772,60 (afschrijving Build Finance)
    expect(due.dueCents + 698_32 + 530_72).toBe(10_772_60)
  })

  it('tweede termijn (27-04-2026): precies één maand rente over het verlaagde saldo', () => {
    const maart = termijn('mrt', '2026-03-25', [5_512_38, 867_71, 2_470_37, 693_10])
    const due = dueInterestForPaymentDate(m, rates, [maart], '2026-04-27')
    expect(due.from).toBe('2026-03-26')
    expect(due.to).toBe('2026-04-25')
    expect(due.parts.map((p) => p.dueCents)).toEqual([3_242_58, 507_57, 1_453_16, 405_43])
    // Rente 5.608,74 + aflossing 1.229,04 = 6.837,78 (afschrijving Build Finance)
    expect(due.dueCents + 698_32 + 530_72).toBe(6_837_78)
  })

  it('de rentecontrole zegt "klopt" als je betaalt wat Build Finance afschrijft', () => {
    const maart = termijn('mrt', '2026-03-25', [5_512_38, 867_71, 2_470_37, 693_10])
    const april = termijn('apr', '2026-04-27', [3_242_58, 507_57, 1_453_16, 405_43])
    const due = interestDueByPayment(m, rates, [maart, april])
    expect(due.get('mrt')).toMatchObject({ differenceCents: 0, status: 'ok' })
    expect(due.get('apr')).toMatchObject({ differenceCents: 0, status: 'ok' })
  })

  it('met werkelijke dagen komt dezelfde lening anders uit (het verschil van € 385,47)', () => {
    const actual = makeMortgage({ startDate: '2026-02-05', parts })
    expect(dueInterestForPaymentDate(actual, rates, [], '2026-03-25').dueCents).toBe(9_158_09)
  })
})
