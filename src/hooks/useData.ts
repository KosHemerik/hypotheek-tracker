import { use, useMemo } from 'react'
import { DataContext } from '@/data/DataContext'
import type { UUID } from '@/domain/types'

export function useData() {
  const ctx = use(DataContext)
  if (!ctx) throw new Error('useData moet binnen <DataProvider> gebruikt worden')
  return ctx
}

/** Eén hypotheek met de bijbehorende rentewijzigingen en betalingen. */
export function useMortgage(id: UUID | undefined) {
  const { mortgages, rates, payments, documents, status } = useData()
  return useMemo(() => {
    const mortgage = mortgages.find((m) => m.id === id) ?? null
    return {
      status,
      mortgage,
      rates: rates.filter((r) => r.mortgageId === id),
      payments: payments.filter((p) => p.mortgageId === id),
      documents: documents.filter((d) => d.mortgageId === id),
    }
  }, [mortgages, rates, payments, documents, status, id])
}
