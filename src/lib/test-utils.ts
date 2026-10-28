import type { InterestRatePeriod, LoanPart, Mortgage, Payment, PaymentLine } from '@/domain/types'

let counter = 0
const nextId = () => `id-${String(++counter).padStart(4, '0')}`
const stamp = () => `2020-01-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`

/** Standaard-leningdeel in tests (hypotheken met één deel). */
export const PART_1 = 'part-1'

export function makePart(overrides: Partial<LoanPart> = {}): LoanPart {
  return {
    id: PART_1,
    mortgageId: 'm',
    name: 'Leningdeel 1',
    principalCents: 100_000_00,
    agreedRepaymentCents: 0,
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
  }
}

/**
 * Hypotheek; zonder `parts` één deel (`PART_1`) met de hele hoofdsom. Met `parts` is de
 * hoofdsom de som van de delen.
 */
export function makeMortgage(overrides: Partial<Mortgage> = {}): Mortgage {
  const principalCents = overrides.principalCents ?? 100_000_00
  const parts = overrides.parts ?? [makePart({ principalCents })]
  return {
    id: nextId(),
    entityId: 'entity-1',
    name: 'Test',
    mortgageNumber: '123',
    startDate: '2024-01-15',
    endDate: null,
    notes: null,
    counterpartyIban: null,
    archivedAt: null,
    interestMethod: 'actual',
    dueDay: null,
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
    parts,
    principalCents: parts.reduce((sum, p) => sum + p.principalCents, 0),
  }
}

export function makeRate(overrides: Partial<InterestRatePeriod> = {}): InterestRatePeriod {
  return {
    id: nextId(),
    mortgageId: 'm',
    loanPartId: PART_1,
    rateMilliPct: 3000,
    effectiveDate: '2024-01-15',
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
  }
}

type PaymentOverrides = Partial<Omit<Payment, 'lines'>> & { lines?: PaymentLine[] }

/**
 * Betaling; zonder `lines` één regel voor `PART_1` met `interestCents`/`principalCents`.
 * Met `lines` zijn de totalen de som van de regels.
 */
export function makePayment(overrides: PaymentOverrides = {}): Payment {
  const lines = overrides.lines ?? [
    {
      loanPartId: PART_1,
      interestCents: overrides.interestCents ?? 0,
      principalCents: overrides.principalCents ?? 0,
    },
  ]
  return {
    id: nextId(),
    mortgageId: 'm',
    date: '2024-02-01',
    description: null,
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
    lines,
    interestCents: lines.reduce((sum, l) => sum + l.interestCents, 0),
    principalCents: lines.reduce((sum, l) => sum + l.principalCents, 0),
  }
}
