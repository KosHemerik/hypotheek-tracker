import { describe, expect, it } from 'vitest'
import type { BankConnection, BankTransaction } from '@/domain/types'
import {
  consentState,
  defaultPsuType,
  formatIban,
  paymentValuesFromTransaction,
  quickPaymentInput,
  transactionsForMortgage,
} from './bank'
import { makeMortgage, makePart, makePayment, makeRate, PART_1 } from './test-utils'

const tx = (overrides: Partial<BankTransaction> = {}): BankTransaction => ({
  id: 't1',
  entityId: 'e',
  connectionId: 'c',
  bookingDate: '2025-03-01',
  amountCents: -1_000_00,
  currency: 'EUR',
  counterpartyName: 'Rabobank Hypotheken',
  counterpartyIban: 'NL01RABO0123456789',
  description: 'Termijn maart',
  paymentId: null,
  ignored: false,
  ...overrides,
})

describe('defaultPsuType', () => {
  it.each([
    ['K.B. Hemerik', 'personal'],
    ['Stevig Vastgoed B.V.', 'business'],
    ['Basko B.V.', 'business'],
    ['Basko BV', 'business'],
    ['Hemerik Holding', 'business'],
    ['Bavo', 'personal'],
  ] as const)('%s → %s', (name, expected) => {
    expect(defaultPsuType(name)).toBe(expected)
  })
})

describe('consentState', () => {
  const conn = (overrides: Partial<BankConnection>): BankConnection => ({
    id: 'c',
    entityId: 'e',
    status: 'active',
    psuType: 'personal',
    aspspName: 'Rabobank',
    iban: null,
    accountName: null,
    validUntil: '2026-12-31T00:00:00Z',
    lastSyncedAt: null,
    balanceCents: null,
    balanceDate: null,
    lastError: null,
    availableAccounts: [],
    ...overrides,
  })
  const now = new Date('2026-12-01T00:00:00Z')

  it('geeft ok, bijna verlopen en verlopen', () => {
    expect(consentState(conn({}), now)).toBe('ok')
    expect(consentState(conn({ validUntil: '2026-12-10T00:00:00Z' }), now)).toBe('expiring')
    expect(consentState(conn({ validUntil: '2026-11-30T00:00:00Z' }), now)).toBe('expired')
    expect(consentState(conn({ status: 'expired' }), now)).toBe('expired')
    expect(consentState(conn({ status: 'revoked' }), now)).toBe('none')
    expect(consentState(null, now)).toBe('none')
  })
})

describe('formatIban', () => {
  it('groepeert per vier tekens', () => {
    expect(formatIban('NL01RABO0123456789')).toBe('NL01 RABO 0123 4567 89')
    expect(formatIban(null)).toBe('')
  })
})

describe('transactionsForMortgage', () => {
  const m = makeMortgage({ counterpartyIban: 'NL01RABO0123456789' })

  it('toont alleen afschrijvingen naar het rekeningnummer van de geldverstrekker, oudste eerst', () => {
    const list = [
      tx({ id: 'b', bookingDate: '2025-03-01' }),
      tx({ id: 'a', bookingDate: '2025-02-01', counterpartyIban: 'nl01 rabo 0123 4567 89' }),
      tx({ id: 'ander', counterpartyIban: 'NL02BANK0000000000' }),
      tx({ id: 'bij', amountCents: 500_00 }),
      tx({ id: 'zonder', counterpartyIban: null }),
    ]
    expect(transactionsForMortgage(list, m).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('toont niets zonder rekeningnummer', () => {
    expect(transactionsForMortgage([tx()], makeMortgage())).toEqual([])
  })
})

describe('quickPaymentInput', () => {
  const m = makeMortgage({ id: 'm1', startDate: '2025-01-01' })

  it('maakt van het hele bedrag rente of aflossing op één deel', () => {
    expect(quickPaymentInput(tx(), m, 'interest', PART_1)).toEqual({
      mortgageId: 'm1',
      date: '2025-03-01',
      description: 'Termijn maart',
      lines: [{ loanPartId: PART_1, interestCents: 1_000_00, principalCents: 0 }],
    })
    expect(quickPaymentInput(tx(), m, 'principal', PART_1).lines).toEqual([
      { loanPartId: PART_1, interestCents: 0, principalCents: 1_000_00 },
    ])
  })

  it('zet een transactie vóór de startdatum op de startdatum', () => {
    expect(quickPaymentInput(tx({ bookingDate: '2024-12-31' }), m, 'interest', PART_1).date).toBe(
      '2025-01-01',
    )
  })
})

describe('paymentValuesFromTransaction', () => {
  // € 120.000 tegen 3% = € 300,00 rente per volle maand.
  const single = makeMortgage({ principalCents: 120_000_00, startDate: '2025-01-01' })
  const rates = [makeRate({ effectiveDate: '2025-01-01', rateMilliPct: 3000 })]
  const feb = makePayment({ date: '2025-02-01', interestCents: 300_00, principalCents: 700_00 })

  it('één deel: rente = verschuldigd, aflossing = restant van het bankbedrag', () => {
    // Februari op 119.300: 298,25 rente → aflossing 1.000 − 298,25 = 701,75.
    expect(paymentValuesFromTransaction(tx(), single, rates, [feb])).toEqual({
      date: '2025-03-01',
      description: 'Termijn maart',
      lines: [{ loanPartId: PART_1, interest: '298,25', principal: '701,75' }],
    })
  })

  it('meerdere delen: rente per deel en de afgesproken aflossing per deel', () => {
    const multi = makeMortgage({
      startDate: '2025-01-01',
      parts: [
        makePart({ id: 'A', principalCents: 100_000_00, agreedRepaymentCents: 250_00 }),
        makePart({ id: 'B', principalCents: 50_000_00, agreedRepaymentCents: 0 }),
      ],
    })
    const multiRates = [
      makeRate({ loanPartId: 'A', effectiveDate: '2025-01-01', rateMilliPct: 3000 }),
      makeRate({ loanPartId: 'B', effectiveDate: '2025-01-01', rateMilliPct: 6000 }),
    ]
    const values = paymentValuesFromTransaction(
      tx({ bookingDate: '2025-02-01' }),
      multi,
      multiRates,
      [],
    )
    expect(values.lines).toEqual([
      { loanPartId: 'A', interest: '250,00', principal: '250,00' },
      { loanPartId: 'B', interest: '250,00', principal: '' },
    ])
  })

  it('kapt de rente niet per deel af als de verschuldigde rente hoger is dan het bankbedrag', () => {
    // Twee delen, elk € 250 per maand; geen eerdere betaling → periode vanaf de start (2 maanden).
    const multi = makeMortgage({
      startDate: '2025-01-01',
      parts: [
        makePart({ id: 'A', principalCents: 100_000_00 }),
        makePart({ id: 'B', principalCents: 50_000_00 }),
      ],
    })
    const multiRates = [
      makeRate({ loanPartId: 'A', effectiveDate: '2025-01-01', rateMilliPct: 3000 }),
      makeRate({ loanPartId: 'B', effectiveDate: '2025-01-01', rateMilliPct: 6000 }),
    ]
    const values = paymentValuesFromTransaction(
      tx({ bookingDate: '2025-03-01', amountCents: -600_00 }),
      multi,
      multiRates,
      [],
    )
    // Januari + februari: per deel € 500 (niet afgekapt op € 600 per deel), geen aflossing.
    expect(values.lines).toEqual([
      { loanPartId: 'A', interest: '500,00', principal: '' },
      { loanPartId: 'B', interest: '500,00', principal: '' },
    ])
  })
})
