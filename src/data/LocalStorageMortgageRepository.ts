import type {
  InterestRatePeriodRow,
  MortgageDocumentRow,
  MortgageRow,
  PaymentRow,
} from '@/domain/db-types'
import {
  documentFromRow,
  documentMetaToUpdate,
  mortgageFromRow,
  mortgageToInsert,
  paymentFromRow,
  paymentToInsert,
  rateFromRow,
  rateToInsert,
} from '@/domain/mappers'
import type { DocumentMetaInput, DocumentUploadInput } from '@/domain/types'
import { IndexedDbFileStore, type FileStore } from './fileStore'
import type { MortgageRepository } from './MortgageRepository'
import { RepositoryError } from './MortgageRepository'

/** Lokale stand-in voor `auth.uid()`; in Supabase vult de database dit zelf. */
const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000000'

const KEYS = {
  mortgages: 'hypotheek-tracker:v1:mortgages',
  rates: 'hypotheek-tracker:v1:interest_rate_periods',
  payments: 'hypotheek-tracker:v1:payments',
  documents: 'hypotheek-tracker:v1:mortgage_documents',
} as const

interface Tables {
  mortgages: MortgageRow[]
  rates: InterestRatePeriodRow[]
  payments: PaymentRow[]
  documents: MortgageDocumentRow[]
}

/**
 * Bewaart rijen in exact dezelfde (snake_case) vorm als de Supabase-tabellen en
 * gebruikt dezelfde mappers. Gedraagt zich als een database: id's en tijdstempels
 * worden hier gegenereerd en verwijderen van een hypotheek cascadeert.
 * Metadata van documenten staat ook in localStorage; de bestanden zelf in IndexedDB.
 */
export class LocalStorageMortgageRepository implements MortgageRepository {
  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly files: FileStore = new IndexedDbFileStore(),
  ) {}

  private read<K extends keyof Tables>(table: K): Tables[K] {
    try {
      const raw = this.storage.getItem(KEYS[table])
      return raw ? (JSON.parse(raw) as Tables[K]) : []
    } catch (error) {
      throw new RepositoryError('Opgeslagen gegevens konden niet worden gelezen.', error)
    }
  }

  private write<K extends keyof Tables>(table: K, rows: Tables[K]): void {
    try {
      this.storage.setItem(KEYS[table], JSON.stringify(rows))
    } catch (error) {
      throw new RepositoryError('Gegevens konden niet worden opgeslagen.', error)
    }
  }

  private meta() {
    const now = new Date().toISOString()
    return { id: crypto.randomUUID(), user_id: LOCAL_USER_ID, created_at: now, updated_at: now }
  }

  private requireMortgage(id: string): MortgageRow {
    const row = this.read('mortgages').find((m) => m.id === id)
    if (!row) throw new RepositoryError('Hypotheek niet gevonden.')
    return row
  }

  async listMortgages() {
    return this.read('mortgages')
      .map(mortgageFromRow)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async getMortgage(id: string) {
    const row = this.read('mortgages').find((m) => m.id === id)
    return row ? mortgageFromRow(row) : null
  }

  async createMortgage(input: Parameters<MortgageRepository['createMortgage']>[0]) {
    const { initialRateMilliPct, ...mortgageInput } = input
    const row: MortgageRow = { ...this.meta(), ...mortgageToInsert(mortgageInput) }
    this.write('mortgages', [...this.read('mortgages'), row])
    await this.createRate({
      mortgageId: row.id,
      rateMilliPct: initialRateMilliPct,
      effectiveDate: row.start_date,
    })
    return mortgageFromRow(row)
  }

  async updateMortgage(id: string, input: Parameters<MortgageRepository['updateMortgage']>[1]) {
    const existing = this.requireMortgage(id)
    const row: MortgageRow = {
      ...existing,
      ...mortgageToInsert(input),
      updated_at: new Date().toISOString(),
    }
    this.write(
      'mortgages',
      this.read('mortgages').map((m) => (m.id === id ? row : m)),
    )
    return mortgageFromRow(row)
  }

  async deleteMortgage(id: string) {
    for (const doc of this.read('documents').filter((d) => d.mortgage_id === id)) {
      await this.deleteDocument(doc.id)
    }
    this.write(
      'mortgages',
      this.read('mortgages').filter((m) => m.id !== id),
    )
    this.write(
      'rates',
      this.read('rates').filter((r) => r.mortgage_id !== id),
    )
    this.write(
      'payments',
      this.read('payments').filter((p) => p.mortgage_id !== id),
    )
  }

  async listRates(mortgageId?: string) {
    return this.read('rates')
      .filter((r) => !mortgageId || r.mortgage_id === mortgageId)
      .map(rateFromRow)
  }

  async createRate(input: Parameters<MortgageRepository['createRate']>[0]) {
    this.requireMortgage(input.mortgageId)
    const row: InterestRatePeriodRow = { ...this.meta(), ...rateToInsert(input) }
    this.write('rates', [...this.read('rates'), row])
    return rateFromRow(row)
  }

  async updateRate(id: string, input: Parameters<MortgageRepository['updateRate']>[1]) {
    const existing = this.read('rates').find((r) => r.id === id)
    if (!existing) throw new RepositoryError('Rentewijziging niet gevonden.')
    const row: InterestRatePeriodRow = {
      ...existing,
      ...rateToInsert(input),
      updated_at: new Date().toISOString(),
    }
    this.write(
      'rates',
      this.read('rates').map((r) => (r.id === id ? row : r)),
    )
    return rateFromRow(row)
  }

  async deleteRate(id: string) {
    this.write(
      'rates',
      this.read('rates').filter((r) => r.id !== id),
    )
  }

  async listPayments(mortgageId?: string) {
    return this.read('payments')
      .filter((p) => !mortgageId || p.mortgage_id === mortgageId)
      .map(paymentFromRow)
  }

  async createPayment(input: Parameters<MortgageRepository['createPayment']>[0]) {
    this.requireMortgage(input.mortgageId)
    const row: PaymentRow = { ...this.meta(), ...paymentToInsert(input) }
    this.write('payments', [...this.read('payments'), row])
    return paymentFromRow(row)
  }

  async updatePayment(id: string, input: Parameters<MortgageRepository['updatePayment']>[1]) {
    const existing = this.read('payments').find((p) => p.id === id)
    if (!existing) throw new RepositoryError('Betaling niet gevonden.')
    const row: PaymentRow = {
      ...existing,
      ...paymentToInsert(input),
      updated_at: new Date().toISOString(),
    }
    this.write(
      'payments',
      this.read('payments').map((p) => (p.id === id ? row : p)),
    )
    return paymentFromRow(row)
  }

  async deletePayment(id: string) {
    this.write(
      'payments',
      this.read('payments').filter((p) => p.id !== id),
    )
  }

  async listDocuments(mortgageId?: string) {
    return this.read('documents')
      .filter((d) => !mortgageId || d.mortgage_id === mortgageId)
      .map(documentFromRow)
  }

  async uploadDocument(input: DocumentUploadInput) {
    this.requireMortgage(input.mortgageId)
    const meta = this.meta()
    const row: MortgageDocumentRow = {
      ...meta,
      mortgage_id: input.mortgageId,
      file_name: input.file.name,
      mime_type: input.file.type || 'application/octet-stream',
      size_bytes: input.file.size,
      category: input.category,
      description: input.description,
      storage_path: `${input.mortgageId}/${meta.id}`,
    }
    // Eerst het bestand, dan de metadata: zo verwijst metadata nooit naar een ontbrekend bestand.
    await this.files.put(row.storage_path, input.file)
    try {
      this.write('documents', [...this.read('documents'), row])
    } catch (error) {
      await this.files.delete(row.storage_path)
      throw error
    }
    return documentFromRow(row)
  }

  async updateDocument(id: string, input: DocumentMetaInput) {
    const existing = this.requireDocument(id)
    const row: MortgageDocumentRow = {
      ...existing,
      ...documentMetaToUpdate(input),
      updated_at: new Date().toISOString(),
    }
    this.write(
      'documents',
      this.read('documents').map((d) => (d.id === id ? row : d)),
    )
    return documentFromRow(row)
  }

  async getDocumentFile(id: string) {
    const row = this.requireDocument(id)
    const blob = await this.files.get(row.storage_path)
    if (!blob) throw new RepositoryError('Het bestand is niet (meer) gevonden in de opslag.')
    return blob
  }

  async deleteDocument(id: string) {
    const row = this.read('documents').find((d) => d.id === id)
    if (!row) return
    this.write(
      'documents',
      this.read('documents').filter((d) => d.id !== id),
    )
    await this.files.delete(row.storage_path)
  }

  private requireDocument(id: string): MortgageDocumentRow {
    const row = this.read('documents').find((d) => d.id === id)
    if (!row) throw new RepositoryError('Document niet gevonden.')
    return row
  }
}
