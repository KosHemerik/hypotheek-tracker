import type { InterestRatePeriod, Mortgage, Payment } from '@/domain/types'

let counter = 0
const nextId = () => `id-${String(++counter).padStart(4, '0')}`
const stamp = () => `2020-01-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`

export function makeMortgage(overrides: Partial<Mortgage> = {}): Mortgage {
  return {
    id: nextId(),
    name: 'Test',
    mortgageNumber: '123',
    principalCents: 100_000_00,
    startDate: '2024-01-15',
    endDate: null,
    notes: null,
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
  }
}

export function makeRate(overrides: Partial<InterestRatePeriod> = {}): InterestRatePeriod {
  return {
    id: nextId(),
    mortgageId: 'm',
    rateMilliPct: 3000,
    effectiveDate: '2024-01-15',
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
  }
}

export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: nextId(),
    mortgageId: 'm',
    date: '2024-02-01',
    interestCents: 0,
    principalCents: 0,
    description: null,
    createdAt: stamp(),
    updatedAt: stamp(),
    ...overrides,
  }
}
