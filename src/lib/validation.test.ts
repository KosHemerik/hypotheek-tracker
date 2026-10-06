import { describe, expect, it } from 'vitest'
import { makeMortgage, makePayment, makeRate } from './test-utils'
import {
  canDeleteRate,
  maxRepayment,
  validateMortgage,
  validatePayment,
  validateRate,
  type PaymentFormValues,
} from './validation'

const mortgage = makeMortgage({ principalCents: 10_000_00, startDate: '2024-01-15' })

describe('validatePayment', () => {
  const payments = [
    makePayment({ id: 'p1', date: '2024-02-01', principalCents: 4_000_00 }),
    makePayment({ id: 'p2', date: '2024-06-01', principalCents: 5_000_00 }),
  ]
  const values = (v: Partial<PaymentFormValues>): PaymentFormValues => ({
    date: '2024-03-01',
    interest: '',
    principal: '',
    description: '',
    ...v,
  })

  it('accepteert een geldige betaling en parset bedragen naar centen', () => {
    const result = validatePayment(
      values({ interest: '25,50', principal: '100' }),
      mortgage,
      payments,
      null,
    )
    expect(result).toEqual({
      ok: true,
      value: {
        date: '2024-03-01',
        interestCents: 25_50,
        principalCents: 100_00,
        description: null,
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
      values({ date: '2024-01-14', interest: '-1', principal: '-2' }),
      mortgage,
      payments,
      null,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.date).toMatch(/startdatum \(15-01-2024\)/)
      expect(result.errors.interest).toBeDefined()
      expect(result.errors.principal).toBeDefined()
    }
  })

  it('weigert een aflossing die het saldo onder 0 brengt, met het maximum in de melding', () => {
    const result = validatePayment(values({ principal: '1.000,01' }), mortgage, payments, null)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors.principal?.replace(/\s/g, ' ')).toMatch(/maximaal € 1.000,00/)
    expect(validatePayment(values({ principal: '1.000,00' }), mortgage, payments, null).ok).toBe(
      true,
    )
  })

  it('houdt rekening met latere betalingen bij het invoegen van een betaling in het verleden', () => {
    // Saldo op 2024-03-01 is 6.000, maar na de betaling van juni is het 1.000: max 1.000.
    expect(maxRepayment(mortgage, payments, null)).toBe(1_000_00)
  })

  it('telt bij bewerken de betaling zelf niet dubbel', () => {
    expect(maxRepayment(mortgage, payments, 'p2')).toBe(6_000_00)
    expect(validatePayment(values({ principal: '6000' }), mortgage, payments, 'p2').ok).toBe(true)
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
    name: 'Woning',
    mortgageNumber: 'NN-1',
    principal: '250.000',
    startDate: '2024-01-15',
    endDate: '2054-01-15',
    notes: '  ',
  }

  it('accepteert een nieuwe hypotheek met eerste rentepercentage', () => {
    expect(validateMortgage({ ...base, initialRate: '3,85' })).toEqual({
      ok: true,
      value: {
        name: 'Woning',
        mortgageNumber: 'NN-1',
        principalCents: 250_000_00,
        startDate: '2024-01-15',
        endDate: '2054-01-15',
        notes: null,
        initialRateMilliPct: 3850,
      },
    })
  })

  it('vereist velden en een einddatum na de startdatum', () => {
    const result = validateMortgage({
      ...base,
      name: '',
      principal: '0',
      endDate: '2020-01-01',
      initialRate: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'endDate',
        'initialRate',
        'name',
        'principal',
      ])
    }
  })

  it('bij bewerken: hoofdsom niet onder het afgeloste bedrag en start niet na eerste betaling', () => {
    const payments = [makePayment({ date: '2024-02-01', principalCents: 300_000_00 })]
    const rates = [makeRate({ effectiveDate: '2024-01-15' })]
    const result = validateMortgage({ ...base, startDate: '2024-03-01' }, { payments, rates })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.principal).toMatch(/al .* afgelost/)
      expect(result.errors.startDate).toMatch(/eerste betaling/)
    }
  })
})
