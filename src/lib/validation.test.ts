import { describe, expect, it } from 'vitest'
import { makeMortgage, makePart, makePayment, makeRate, PART_1 } from './test-utils'
import {
  canDeleteLoanPart,
  canDeleteRate,
  copyPaymentFormValues,
  maxRepayment,
  newPaymentFormValues,
  validateEntityName,
  validateLoanPart,
  validateMortgage,
  validateNewLoanParts,
  validatePayment,
  validateRate,
  type PaymentFormValues,
} from './validation'

const mortgage = makeMortgage({ principalCents: 10_000_00, startDate: '2024-01-15' })
const part = mortgage.parts[0]!

describe('validatePayment', () => {
  const payments = [
    makePayment({ id: 'p1', date: '2024-02-01', principalCents: 4_000_00 }),
    makePayment({ id: 'p2', date: '2024-06-01', principalCents: 5_000_00 }),
  ]
  const values = (
    line: Partial<{ interest: string; principal: string }> = {},
    v: Partial<PaymentFormValues> = {},
  ): PaymentFormValues => ({
    date: '2024-03-01',
    description: '',
    lines: [{ loanPartId: PART_1, interest: '', principal: '', ...line }],
    ...v,
  })

  it('accepteert een geldige betaling en parset bedragen naar centen', () => {
    expect(
      validatePayment(values({ interest: '25,50', principal: '100' }), mortgage, payments, null),
    ).toEqual({
      ok: true,
      value: {
        date: '2024-03-01',
        description: null,
        lines: [{ loanPartId: PART_1, interestCents: 25_50, principalCents: 100_00 }],
      },
    })
  })

  it('staat toe dat rente of aflossing 0 is, maar niet allebei', () => {
    expect(validatePayment(values({ interest: '25' }), mortgage, payments, null).ok).toBe(true)
    expect(validatePayment(values({ principal: '25' }), mortgage, payments, null).ok).toBe(true)
    const result = validatePayment(
      values({ interest: '0', principal: '0,00' }),
      mortgage,
      payments,
      null,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.form).toMatch(/groter dan € 0/)
  })

  it('weigert negatieve bedragen en datums vóór de startdatum', () => {
    const result = validatePayment(
      values({ interest: '-1', principal: '-2' }, { date: '2024-01-14' }),
      mortgage,
      payments,
      null,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.date).toMatch(/startdatum \(15-01-2024\)/)
      expect(result.errors.lines[PART_1]?.interest).toBeDefined()
      expect(result.errors.lines[PART_1]?.principal).toBeDefined()
    }
  })

  it('weigert een aflossing die het saldo onder 0 brengt, met het maximum in de melding', () => {
    const result = validatePayment(values({ principal: '1.000,01' }), mortgage, payments, null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.lines[PART_1]?.principal?.replace(/\s/g, ' ')).toMatch(
        /maximaal € 1.000,00/,
      )
    }
    expect(validatePayment(values({ principal: '1.000,00' }), mortgage, payments, null).ok).toBe(
      true,
    )
  })

  it('houdt rekening met latere betalingen bij het invoegen van een betaling in het verleden', () => {
    // Saldo op 2024-03-01 is 6.000, maar na de betaling van juni is het 1.000: max 1.000.
    expect(maxRepayment(part, payments, null)).toBe(1_000_00)
  })

  it('telt bij bewerken de betaling zelf niet dubbel', () => {
    expect(maxRepayment(part, payments, 'p2')).toBe(6_000_00)
    expect(validatePayment(values({ principal: '6000' }), mortgage, payments, 'p2').ok).toBe(true)
  })

  describe('met meerdere leningdelen', () => {
    const multi = makeMortgage({
      startDate: '2024-01-15',
      parts: [
        makePart({ id: 'A', name: 'A', principalCents: 10_000_00 }),
        makePart({ id: 'B', name: 'B', principalCents: 2_000_00 }),
      ],
    })
    const existing = [
      makePayment({
        date: '2024-02-01',
        lines: [{ loanPartId: 'B', interestCents: 0, principalCents: 1_500_00 }],
      }),
    ]
    const v = (
      a: Partial<{ interest: string; principal: string }>,
      b: Partial<{ interest: string; principal: string }>,
    ) => ({
      date: '2024-03-01',
      description: 'Termijn',
      lines: [
        { loanPartId: 'A', interest: '', principal: '', ...a },
        { loanPartId: 'B', interest: '', principal: '', ...b },
      ],
    })

    it('maakt alleen regels voor delen met een bedrag', () => {
      const result = validatePayment(v({ interest: '25' }, {}), multi, existing, null)
      expect(result.ok && result.value.lines).toEqual([
        { loanPartId: 'A', interestCents: 25_00, principalCents: 0 },
      ])
    })

    it('controleert het maximum per leningdeel', () => {
      // Deel B heeft nog 500 open; deel A 10.000.
      const result = validatePayment(
        v({ principal: '600' }, { principal: '600' }),
        multi,
        existing,
        null,
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.lines.A).toBeUndefined()
        expect(result.errors.lines.B?.principal?.replace(/\s/g, ' ')).toMatch(/maximaal € 500,00/)
      }
    })
  })
})

describe('formulierwaarden voor betalingen', () => {
  const parts = [
    makePart({ id: 'A', agreedRepaymentCents: 438_75 }),
    makePart({ id: 'B', agreedRepaymentCents: 0 }),
  ]

  it('vult bij een nieuwe betaling de afgesproken aflossing per deel in', () => {
    expect(newPaymentFormValues(parts, '2026-11-01')).toEqual({
      date: '2026-11-01',
      description: 'Maandtermijn',
      lines: [
        { loanPartId: 'A', interest: '', principal: '438,75' },
        { loanPartId: 'B', interest: '', principal: '' },
      ],
    })
  })

  it('kopieert bedragen per deel en zet de datum een maand later', () => {
    const payment = makePayment({
      date: '2026-01-31',
      description: 'Maandtermijn',
      lines: [{ loanPartId: 'A', interestCents: 853_52, principalCents: 438_75 }],
    })
    expect(copyPaymentFormValues(payment, parts)).toEqual({
      date: '2026-02-28',
      description: 'Maandtermijn',
      lines: [
        { loanPartId: 'A', interest: '853,52', principal: '438,75' },
        { loanPartId: 'B', interest: '', principal: '' },
      ],
    })
  })

  it('geeft een kopie die direct valide is als nieuwe betaling', () => {
    const payment = makePayment({
      id: 'p1',
      date: '2024-02-01',
      interestCents: 25_00,
      principalCents: 100_00,
    })
    const values = copyPaymentFormValues(payment, mortgage.parts)
    expect(validatePayment(values, mortgage, [payment], null)).toEqual({
      ok: true,
      value: {
        date: '2024-03-01',
        description: null,
        lines: [{ loanPartId: PART_1, interestCents: 25_00, principalCents: 100_00 }],
      },
    })
  })
})

describe('validateRate', () => {
  const rates = [
    makeRate({ id: 'r1', effectiveDate: '2024-01-15', rateMilliPct: 4000 }),
    makeRate({ id: 'r2', effectiveDate: '2024-06-01', rateMilliPct: 3500 }),
  ]

  it('accepteert een nieuw percentage', () => {
    expect(
      validateRate({ rate: '3,1', effectiveDate: '2025-01-01' }, mortgage, rates, null),
    ).toEqual({
      ok: true,
      value: { rateMilliPct: 3100, effectiveDate: '2025-01-01' },
    })
  })

  it('weigert dubbele ingangsdatums, datums vóór de start en onzinnige percentages', () => {
    const dup = validateRate({ rate: '3', effectiveDate: '2024-06-01' }, mortgage, rates, null)
    expect(!dup.ok && dup.errors.effectiveDate).toMatch(/al een rentepercentage/)
    const early = validateRate({ rate: '3', effectiveDate: '2024-01-01' }, mortgage, rates, null)
    expect(!early.ok && early.errors.effectiveDate).toMatch(/startdatum/)
    const high = validateRate({ rate: '38,5', effectiveDate: '2025-01-01' }, mortgage, rates, null)
    expect(!high.ok && high.errors.rate).toMatch(/te hoog/)
  })

  it('staat bewerken met dezelfde datum toe, maar het startpercentage niet verplaatsen', () => {
    expect(
      validateRate({ rate: '3,2', effectiveDate: '2024-06-01' }, mortgage, rates, 'r2').ok,
    ).toBe(true)
    const moved = validateRate({ rate: '4', effectiveDate: '2024-02-01' }, mortgage, rates, 'r1')
    expect(!moved.ok && moved.errors.effectiveDate).toMatch(/niet worden verplaatst/)
  })

  it('canDeleteRate beschermt het startpercentage', () => {
    expect(canDeleteRate(rates[0]!, mortgage, rates).ok).toBe(false)
    expect(canDeleteRate(rates[1]!, mortgage, rates).ok).toBe(true)
    expect(canDeleteRate(rates[1]!, mortgage, [rates[1]!]).ok).toBe(false)
  })
})

describe('validateMortgage', () => {
  const base = {
    entityId: 'entity-1',
    name: 'Woning',
    mortgageNumber: 'NN-1',
    startDate: '2024-01-15',
    endDate: '2054-01-15',
    notes: '  ',
    counterpartyIban: 'nl91 abna 0417 1643 00',
    interestMethod: 'actual' as const,
    dueDay: '',
  }

  it('accepteert een geldige hypotheek', () => {
    expect(validateMortgage(base)).toEqual({
      ok: true,
      value: {
        entityId: 'entity-1',
        name: 'Woning',
        mortgageNumber: 'NN-1',
        startDate: '2024-01-15',
        endDate: '2054-01-15',
        notes: null,
        counterpartyIban: 'NL91ABNA0417164300',
        interestMethod: 'actual',
        dueDay: null,
      },
    })
  })

  it('vereist bij 30/360 een vervaldag tussen 1 en 31', () => {
    const missing = validateMortgage({ ...base, interestMethod: 'thirty_360', dueDay: '' })
    expect(!missing.ok && missing.errors.dueDay).toMatch(/vervaldag/)
    expect(validateMortgage({ ...base, interestMethod: 'thirty_360', dueDay: '32' }).ok).toBe(false)
    const ok = validateMortgage({ ...base, interestMethod: 'thirty_360', dueDay: '25' })
    expect(ok.ok && [ok.value.interestMethod, ok.value.dueDay]).toEqual(['thirty_360', 25])
  })

  it('controleert het IBAN van de geldverstrekker (optioneel)', () => {
    const wrong = validateMortgage({ ...base, counterpartyIban: 'NL92ABNA0417164300' })
    expect(!wrong.ok && wrong.errors.counterpartyIban).toMatch(/controlegetal/)
    const empty = validateMortgage({ ...base, counterpartyIban: '  ' })
    expect(empty.ok && empty.value.counterpartyIban).toBeNull()
  })

  it('vereist velden en een einddatum na de startdatum', () => {
    const result = validateMortgage({ ...base, entityId: '', name: '', endDate: '2020-01-01' })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(['endDate', 'entityId', 'name'])
  })

  it('bij bewerken: start niet na eerste betaling en vóór de eerstvolgende rentewijziging van elk deel', () => {
    const payments = [makePayment({ date: '2024-02-01', principalCents: 1_00 })]
    const late = validateMortgage({ ...base, startDate: '2024-03-01' }, { payments, rates: [] })
    expect(!late.ok && late.errors.startDate).toMatch(/eerste betaling/)

    const rates = [
      makeRate({ loanPartId: 'A', effectiveDate: '2024-01-15' }),
      makeRate({ loanPartId: 'A', effectiveDate: '2024-09-01' }),
      makeRate({ loanPartId: 'B', effectiveDate: '2024-01-15' }),
      makeRate({ loanPartId: 'B', effectiveDate: '2024-05-01' }),
    ]
    const tooLate = validateMortgage({ ...base, startDate: '2024-05-01' }, { payments: [], rates })
    expect(!tooLate.ok && tooLate.errors.startDate).toMatch(/01-05-2024/)
    expect(validateMortgage({ ...base, startDate: '2024-04-30' }, { payments: [], rates }).ok).toBe(
      true,
    )
  })
})

describe('leningdelen', () => {
  it('valideert een nieuw deel met startrente en afgesproken aflossing', () => {
    expect(
      validateLoanPart({
        name: 'Deel 2',
        principal: '65.000',
        agreedRepayment: '180,56',
        initialRate: '4,45',
      }),
    ).toEqual({
      ok: true,
      value: {
        name: 'Deel 2',
        principalCents: 65_000_00,
        agreedRepaymentCents: 180_56,
        initialRateMilliPct: 4450,
      },
    })
  })

  it('ziet een lege afgesproken aflossing als 0 (aflossingsvrij)', () => {
    const result = validateLoanPart({
      name: 'Aflossingsvrij',
      principal: '100000',
      agreedRepayment: '',
    })
    expect(result.ok && result.value.agreedRepaymentCents).toBe(0)
  })

  it('weigert dubbele namen, te lage bedragen en een te hoge aflossing', () => {
    const result = validateLoanPart(
      { name: 'deel 1', principal: '1.000', agreedRepayment: '2.000' },
      { otherNames: ['Deel 1'], repaidCents: 1_500_00 },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.name).toMatch(/al een leningdeel/)
      expect(result.errors.principal).toMatch(/al .* afgelost/)
      expect(result.errors.agreedRepayment).toMatch(/niet hoger/)
    }
  })

  it('valideert alle delen van een nieuwe hypotheek', () => {
    const ok = validateNewLoanParts([
      { name: 'Deel 1', principal: '285000', agreedRepayment: '', initialRate: '3,92' },
      { name: 'Deel 2', principal: '65000', agreedRepayment: '180,56', initialRate: '4,45' },
    ])
    expect(ok.ok && ok.value.map((p) => p.initialRateMilliPct)).toEqual([3920, 4450])

    const dup = validateNewLoanParts([
      { name: 'Deel', principal: '1', agreedRepayment: '', initialRate: '3' },
      { name: 'deel', principal: '1', agreedRepayment: '', initialRate: '' },
    ])
    expect(dup.ok).toBe(false)
    if (!dup.ok) {
      expect(dup.errors[0]?.name).toMatch(/al een leningdeel/)
      expect(dup.errors[1]?.initialRate).toBeDefined()
    }
    expect(validateNewLoanParts([])).toMatchObject({
      ok: false,
      form: 'Voeg minimaal één leningdeel toe.',
    })
  })

  it('canDeleteLoanPart: niet het laatste deel en niet met betalingen', () => {
    const a = makePart({ id: 'A' })
    const b = makePart({ id: 'B' })
    const m = makeMortgage({ parts: [a, b] })
    const payments = [
      makePayment({ lines: [{ loanPartId: 'A', interestCents: 1, principalCents: 0 }] }),
    ]
    expect(canDeleteLoanPart(a, m, payments).ok).toBe(false)
    expect(canDeleteLoanPart(b, m, payments).ok).toBe(true)
    expect(canDeleteLoanPart(a, makeMortgage({ parts: [a] }), []).ok).toBe(false)
  })
})

describe('validateEntityName', () => {
  const entities = [
    { id: 'a', name: 'K.B. Hemerik' },
    { id: 'b', name: 'Basko B.V.' },
  ]

  it('accepteert een nieuwe naam', () => {
    expect(validateEntityName('Stevig Vastgoed B.V.', entities)).toBeNull()
  })

  it('weigert leeg, te lang en dubbel (hoofdletterongevoelig)', () => {
    expect(validateEntityName('   ', entities)).toMatch(/Vul een naam/)
    expect(validateEntityName('x'.repeat(81), entities)).toMatch(/maximaal 80/)
    expect(validateEntityName(' basko b.v. ', entities)).toMatch(/al een entiteit/)
  })

  it('staat bij hernoemen de eigen naam toe', () => {
    expect(validateEntityName('Basko BV', entities, 'b')).toBeNull()
    expect(validateEntityName('basko b.v.', entities, 'b')).toBeNull()
  })
})
