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
  BankConnection,
  BankLinkResult,
  BankPsuType,
  BankTransaction,
  DocumentCategory,
  Entity,
  DocumentMetaInput,
  InterestRatePeriod,
  InterestRatePeriodInput,
  LoanPartInput,
  Mortgage,
  MortgageDocument,
  MortgageInput,
  NewLoanPartInput,
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
 *
 * Entiteiten werken als filter: `mortgages`, `rates`, `payments`, `documents` en
 * `sampleIds` bevatten alleen de gegevens van de gekozen entiteit. Pagina's hoeven
 * daar dus niets voor te doen.
 */

interface LoadedData {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  entities: Entity[]
  mortgages: Mortgage[]
  rates: InterestRatePeriod[]
  payments: Payment[]
  documents: MortgageDocument[]
  sampleIds: UUID[]
  bankConnections: BankConnection[]
  bankTransactions: BankTransaction[]
}

export interface DataState extends LoadedData {
  /** Bankkoppeling van de gekozen entiteit (of `null`). */
  bankConnection: BankConnection | null
  /** De gekozen entiteit; `null` als er (nog) geen entiteiten zijn. */
  currentEntity: Entity | null
  /** Alle hypotheken van alle entiteiten (bijv. om bij een directe link te wisselen). */
  allMortgages: Mortgage[]
}

export interface DataActions {
  selectEntity(id: UUID): void
  createEntity(name: string): Promise<Entity>
  renameEntity(id: UUID, name: string): Promise<void>
  deleteEntity(id: UUID): Promise<void>
  createMortgage(input: NewMortgageInput): Promise<Mortgage>
  createLoanPart(input: NewLoanPartInput): Promise<void>
  updateLoanPart(id: UUID, input: LoanPartInput): Promise<void>
  deleteLoanPart(id: UUID): Promise<void>
  updateMortgage(id: UUID, input: MortgageInput): Promise<void>
  setMortgageArchived(id: UUID, archived: boolean): Promise<void>
  deleteMortgage(id: UUID): Promise<void>
  createRate(input: InterestRatePeriodInput): Promise<void>
  updateRate(id: UUID, input: InterestRatePeriodInput): Promise<void>
  deleteRate(id: UUID): Promise<void>
  /** Geeft de opgeslagen betaling terug (bijv. om een banktransactie te koppelen). */
  createPayment(input: PaymentInput): Promise<Payment>
  updatePayment(id: UUID, input: PaymentInput): Promise<void>
  deletePayment(id: UUID): Promise<void>
  /**
   * Uploadt bestanden één voor één. Mislukte uploads stoppen de rest niet;
   * hun meldingen komen terug in `failed`.
   */
  uploadDocuments(
    mortgageId: UUID,
    files: File[],
    meta: { category: (file: File) => DocumentCategory; description: string | null },
  ): Promise<{ uploaded: number; failed: string[] }>
  updateDocument(id: UUID, input: DocumentMetaInput): Promise<void>
  deleteDocument(id: UUID): Promise<void>
  getDocumentFile(id: UUID): Promise<Blob>
  listBanks(psuType: BankPsuType): Promise<string[]>
  startBankLink(input: {
    entityId: UUID
    psuType: BankPsuType
    bank: string
    redirectUrl: string
  }): Promise<string>
  completeBankLink(input: { code: string; state: string }): Promise<BankLinkResult>
  selectBankAccount(connectionId: UUID, accountUid: string): Promise<BankLinkResult>
  syncBank(entityId: UUID): Promise<{ added: number; fetched: number }>
  disconnectBank(entityId: UUID): Promise<void>
  updateBankTransaction(
    id: UUID,
    input: { paymentId?: UUID | null; ignored?: boolean },
  ): Promise<void>
  loadSampleData(): Promise<void>
  clearSampleData(): Promise<void>
}

export type DataContextValue = DataState & DataActions

// eslint-disable-next-line react-refresh/only-export-components
export const DataContext = createContext<DataContextValue | null>(null)

const initialState: LoadedData = {
  status: 'loading',
  error: null,
  entities: [],
  mortgages: [],
  rates: [],
  payments: [],
  documents: [],
  sampleIds: [],
  bankConnections: [],
  bankTransactions: [],
}

export function DataProvider({
  repository,
  autoSeed = false,
  children,
}: {
  repository: MortgageRepository
  /** Voorbeelddata laden bij het allereerste gebruik (alleen lokaal, nooit in je echte database). */
  autoSeed?: boolean
  children: ReactNode
}) {
  const [state, setState] = useState<LoadedData>(initialState)
  const [selectedId, setSelectedId] = useState<UUID | null>(readSelectedEntity)
  const autoSeeded = useRef(false)

  const reload = useCallback(async () => {
    try {
      // Entiteiten eerst: de lokale opslag koppelt daarbij oude hypotheken aan een entiteit.
      const entities = await repository.listEntities()
      const [mortgages, rates, payments, documents] = await Promise.all([
        repository.listMortgages(),
        repository.listRates(),
        repository.listPayments(),
        repository.listDocuments(),
      ])
      // Bankgegevens zijn een extra: als die niet laden, werkt de rest van de app gewoon.
      const [bankConnections, bankTransactions] = await Promise.all([
        repository.listBankConnections().catch(() => [] as BankConnection[]),
        repository.listBankTransactions().catch(() => [] as BankTransaction[]),
      ])
      const existing = new Set(mortgages.map((m) => m.id))
      setState({
        status: 'ready',
        error: null,
        entities,
        mortgages,
        rates,
        payments,
        documents,
        bankConnections,
        bankTransactions,
        sampleIds: getSeedMortgageIds().filter((id) => existing.has(id)),
      })
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error: messageOf(error) }))
    }
  }, [repository])

  useEffect(() => {
    void (async () => {
      if (autoSeed && !autoSeeded.current && shouldAutoSeed()) {
        autoSeeded.current = true
        const [entities, existing] = await Promise.all([
          repository.listEntities(),
          repository.listMortgages(),
        ]).catch(() => [[], []] as [Entity[], Mortgage[]])
        const first = entities[0]
        if (first && existing.length === 0) await loadSampleData(repository, first.id)
      }
      await reload()
    })()
  }, [repository, reload, autoSeed])

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

  // Gekozen entiteit; valt terug op de eerste als de opgeslagen keuze niet (meer) bestaat.
  const currentEntity = state.entities.find((e) => e.id === selectedId) ?? state.entities[0] ?? null
  const currentEntityId = currentEntity?.id ?? null

  const selectEntity = useCallback((id: UUID) => {
    setSelectedId(id)
    writeSelectedEntity(id)
  }, [])

  const actions = useMemo<DataActions>(
    () => ({
      selectEntity,
      createEntity: (name) => mutate(() => repository.createEntity(name)),
      renameEntity: (id, name) =>
        mutate(() => repository.renameEntity(id, name).then(() => undefined)),
      deleteEntity: (id) => mutate(() => repository.deleteEntity(id)),
      createMortgage: (input) => mutate(() => repository.createMortgage(input)),

      updateMortgage: (id, input) =>
        mutate(async () => {
          const before = await repository.getMortgage(id)
          await repository.updateMortgage(id, input)
          // Het eerste rentepercentage van elk leningdeel loopt altijd vanaf de startdatum:
          // schuif het mee.
          if (before && before.startDate !== input.startDate) {
            const rates = await repository.listRates(id)
            for (const part of before.parts) {
              const first = sortRatesChronologically(
                rates.filter((r) => r.loanPartId === part.id),
              )[0]
              if (first) {
                await repository.updateRate(first.id, {
                  mortgageId: id,
                  loanPartId: part.id,
                  rateMilliPct: first.rateMilliPct,
                  effectiveDate: input.startDate,
                })
              }
            }
          }
        }),

      createLoanPart: (input) =>
        mutate(() => repository.createLoanPart(input).then(() => undefined)),
      updateLoanPart: (id, input) =>
        mutate(() => repository.updateLoanPart(id, input).then(() => undefined)),
      deleteLoanPart: (id) => mutate(() => repository.deleteLoanPart(id)),

      setMortgageArchived: (id, archived) =>
        mutate(() => repository.setMortgageArchived(id, archived).then(() => undefined)),
      deleteMortgage: (id) =>
        mutate(async () => {
          await repository.deleteMortgage(id)
          forgetSeedMortgage(id)
        }),

      createRate: (input) => mutate(() => repository.createRate(input).then(() => undefined)),
      updateRate: (id, input) =>
        mutate(() => repository.updateRate(id, input).then(() => undefined)),
      deleteRate: (id) => mutate(() => repository.deleteRate(id)),
      createPayment: (input) => mutate(() => repository.createPayment(input)),
      updatePayment: (id, input) =>
        mutate(() => repository.updatePayment(id, input).then(() => undefined)),
      deletePayment: (id) => mutate(() => repository.deletePayment(id)),
      uploadDocuments: (mortgageId, files, meta) =>
        mutate(async () => {
          const failed: string[] = []
          let uploaded = 0
          for (const file of files) {
            try {
              await repository.uploadDocument({
                mortgageId,
                file,
                category: meta.category(file),
                description: meta.description,
              })
              uploaded++
            } catch (error) {
              failed.push(`${file.name}: ${messageOf(error)}`)
            }
          }
          return { uploaded, failed }
        }),
      updateDocument: (id, input) =>
        mutate(() => repository.updateDocument(id, input).then(() => undefined)),
      deleteDocument: (id) => mutate(() => repository.deleteDocument(id)),
      getDocumentFile: (id) => repository.getDocumentFile(id),
      listBanks: (psuType) => repository.listBanks(psuType),
      startBankLink: (input) => repository.startBankLink(input).then((r) => r.url),
      completeBankLink: (input) => mutate(() => repository.completeBankLink(input)),
      selectBankAccount: (connectionId, accountUid) =>
        mutate(() => repository.selectBankAccount(connectionId, accountUid)),
      syncBank: (entityId) => mutate(() => repository.syncBank(entityId)),
      disconnectBank: (entityId) => mutate(() => repository.disconnectBank(entityId)),
      updateBankTransaction: (id, input) =>
        mutate(() => repository.updateBankTransaction(id, input)),
      loadSampleData: () =>
        mutate(async () => {
          if (!currentEntityId) throw new Error('Kies eerst een entiteit.')
          await loadSampleData(repository, currentEntityId)
        }),
      clearSampleData: () => mutate(() => clearSampleData(repository)),
    }),
    [mutate, repository, selectEntity, currentEntityId],
  )

  const filtered = useMemo<DataState>(() => {
    const mortgages = state.mortgages.filter((m) => m.entityId === currentEntityId)
    const ids = new Set(mortgages.map((m) => m.id))
    return {
      ...state,
      currentEntity,
      allMortgages: state.mortgages,
      mortgages,
      rates: state.rates.filter((r) => ids.has(r.mortgageId)),
      payments: state.payments.filter((p) => ids.has(p.mortgageId)),
      documents: state.documents.filter((d) => ids.has(d.mortgageId)),
      sampleIds: state.sampleIds.filter((id) => ids.has(id)),
      bankConnection: state.bankConnections.find((c) => c.entityId === currentEntityId) ?? null,
      bankTransactions: state.bankTransactions.filter((t) => t.entityId === currentEntityId),
    }
  }, [state, currentEntity, currentEntityId])

  const value = useMemo(() => ({ ...filtered, ...actions }), [filtered, actions])
  return <DataContext value={value}>{children}</DataContext>
}

const SELECTED_ENTITY_KEY = 'hypotheek-tracker:selected-entity'

/** Laatst gekozen entiteit (alleen een gemak per browser; mag ontbreken). */
function readSelectedEntity(): UUID | null {
  try {
    return localStorage.getItem(SELECTED_ENTITY_KEY)
  } catch {
    return null
  }
}

function writeSelectedEntity(id: UUID) {
  try {
    localStorage.setItem(SELECTED_ENTITY_KEY, id)
  } catch {
    // negeren: de keuze geldt dan alleen voor deze sessie
  }
}
