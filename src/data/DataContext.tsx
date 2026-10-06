import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  InterestRatePeriod,
  InterestRatePeriodInput,
  Mortgage,
  MortgageInput,
  NewMortgageInput,
  Payment,
  PaymentInput,
  UUID,
} from '@/domain/types'
import { sortRatesChronologically } from '@/lib/calculations'
import { messageOf } from '@/lib/errors'
import type { MortgageRepository } from './MortgageRepository'
import {
  clearSampleData,
  forgetSeedMortgage,
  getSeedMortgageIds,
  loadSampleData,
  shouldAutoSeed,
} from './seed'

/**
 * Houdt alle data in het geheugen (het gaat om kleine hoeveelheden) en biedt de
 * mutaties aan de UI aan. Praat uitsluitend via de `MortgageRepository`-interface met
 * de opslag; na elke mutatie wordt opnieuw ingeladen zodat de UI altijd de bron volgt.
 */

export interface DataState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  mortgages: Mortgage[]
  rates: InterestRatePeriod[]
  payments: Payment[]
  /** Id's van hypotheken die voorbeelddata zijn. */
  sampleIds: UUID[]
}

export interface DataActions {
  createMortgage(input: NewMortgageInput): Promise<Mortgage>
  updateMortgage(id: UUID, input: MortgageInput): Promise<void>
  deleteMortgage(id: UUID): Promise<void>
  createRate(input: InterestRatePeriodInput): Promise<void>
  updateRate(id: UUID, input: InterestRatePeriodInput): Promise<void>
  deleteRate(id: UUID): Promise<void>
  createPayment(input: PaymentInput): Promise<void>
  updatePayment(id: UUID, input: PaymentInput): Promise<void>
  deletePayment(id: UUID): Promise<void>
  loadSampleData(): Promise<void>
  clearSampleData(): Promise<void>
}

export type DataContextValue = DataState & DataActions

// eslint-disable-next-line react-refresh/only-export-components
export const DataContext = createContext<DataContextValue | null>(null)

const initialState: DataState = {
  status: 'loading',
  error: null,
  mortgages: [],
  rates: [],
  payments: [],
  sampleIds: [],
}

export function DataProvider({
  repository,
  children,
}: {
  repository: MortgageRepository
  children: ReactNode
}) {
  const [state, setState] = useState<DataState>(initialState)
  const autoSeeded = useRef(false)

  const reload = useCallback(async () => {
    try {
      const [mortgages, rates, payments] = await Promise.all([
        repository.listMortgages(),
        repository.listRates(),
        repository.listPayments(),
      ])
      const existing = new Set(mortgages.map((m) => m.id))
      setState({
        status: 'ready',
        error: null,
        mortgages,
        rates,
        payments,
        sampleIds: getSeedMortgageIds().filter((id) => existing.has(id)),
      })
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error: messageOf(error) }))
    }
  }, [repository])

  useEffect(() => {
    void (async () => {
      if (!autoSeeded.current && shouldAutoSeed()) {
        autoSeeded.current = true
        const existing = await repository.listMortgages().catch(() => [])
        if (existing.length === 0) await loadSampleData(repository)
      }
      await reload()
    })()
  }, [repository, reload])

  /** Voert een mutatie uit en laadt daarna opnieuw, ook als de mutatie faalt. */
  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn()
      } finally {
        await reload()
      }
    },
    [reload],
  )

  const actions = useMemo<DataActions>(
    () => ({
      createMortgage: (input) => mutate(() => repository.createMortgage(input)),

      updateMortgage: (id, input) =>
        mutate(async () => {
          const before = await repository.getMortgage(id)
          await repository.updateMortgage(id, input)
          // Het eerste rentepercentage loopt altijd vanaf de startdatum: schuif het mee.
          if (before && before.startDate !== input.startDate) {
            const first = sortRatesChronologically(await repository.listRates(id))[0]
            if (first) {
              await repository.updateRate(first.id, {
                mortgageId: id,
                rateMilliPct: first.rateMilliPct,
                effectiveDate: input.startDate,
              })
            }
          }
        }),

      deleteMortgage: (id) =>
        mutate(async () => {
          await repository.deleteMortgage(id)
          forgetSeedMortgage(id)
        }),

      createRate: (input) => mutate(() => repository.createRate(input).then(() => undefined)),
      updateRate: (id, input) =>
        mutate(() => repository.updateRate(id, input).then(() => undefined)),
      deleteRate: (id) => mutate(() => repository.deleteRate(id)),
      createPayment: (input) => mutate(() => repository.createPayment(input).then(() => undefined)),
      updatePayment: (id, input) =>
        mutate(() => repository.updatePayment(id, input).then(() => undefined)),
      deletePayment: (id) => mutate(() => repository.deletePayment(id)),
      loadSampleData: () => mutate(() => loadSampleData(repository)),
      clearSampleData: () => mutate(() => clearSampleData(repository)),
    }),
    [mutate, repository],
  )

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions])
  return <DataContext value={value}>{children}</DataContext>
}
