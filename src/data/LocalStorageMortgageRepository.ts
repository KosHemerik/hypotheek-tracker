import type {
  EntityRow,
  InterestRatePeriodRow,
  LoanPartRow,
  MortgageDocumentRow,
  MortgageRow,
  PaymentLineRow,
  PaymentRow,
} from '@/domain/db-types'
import {
  documentFromRow,
  documentMetaToUpdate,
  entityFromRow,
  loanPartFromRow,
  loanPartToInsert,
  mortgageFromRow,
  mortgageToInsert,
  paymentFromRow,
  rateFromRow,
  rateToInsert,
  sortParts,
} from '@/domain/mappers'
import type {
  BankLinkResult,
  DocumentMetaInput,
  DocumentUploadInput,
  InterestRatePeriodInput,
  LoanPartInput,
  MortgageInput,
  NewLoanPartInput,
  NewMortgageInput,
  PaymentInput,
} from '@/domain/types'
import { IndexedDbFileStore, type FileStore } from './fileStore'
import type { MortgageRepository } from './MortgageRepository'
import { RepositoryError } from './MortgageRepository'

/** Lokale stand-in voor `auth.uid()`; in Supabase vult de database dit zelf. */
const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000000'

/** Startentiteiten, gelijk aan de Supabase-migratie `…_entities.sql`. */
const DEFAULT_ENTITY_NAMES = ['K.B. Hemerik', 'Stevig Vastgoed B.V.', 'Basko B.V.']

/** Naam van het leningdeel dat bestaande hypotheken bij de omzetting krijgen. */
const DEFAULT_PART_NAME = 'Leningdeel 1'

const KEYS = {
  entities: 'hypotheek-tracker:v1:entities',
  mortgages: 'hypotheek-tracker:v1:mortgages',
  parts: 'hypotheek-tracker:v1:loan_parts',
  rates: 'hypotheek-tracker:v1:interest_rate_periods',
  payments: 'hypotheek-tracker:v1:payments',
  lines: 'hypotheek-tracker:v1:payment_lines',
  documents: 'hypotheek-tracker:v1:mortgage_documents',
} as const

interface Tables {
  entities: EntityRow[]
  mortgages: MortgageRow[]
  parts: LoanPartRow[]
  rates: InterestRatePeriodRow[]
  payments: PaymentRow[]
  lines: PaymentLineRow[]
  documents: MortgageDocumentRow[]
}

/** Velden uit oudere versies (vóór entiteiten en leningdelen). */
type LegacyMortgageRow = MortgageRow & { principal_cents?: number; entity_id?: string }
type LegacyRateRow = InterestRatePeriodRow & { loan_part_id?: string }
type LegacyPaymentRow = PaymentRow & { interest_cents?: number; principal_cents?: number }

/**
 * Bewaart rijen in exact dezelfde (snake_case) vorm als de Supabase-tabellen en
 * gebruikt dezelfde mappers. Gedraagt zich als een database: id's en tijdstempels
 * worden hier gegenereerd, verwijderen cascadeert en een betaling met regels wordt in
 * één keer weggeschreven. Metadata van documenten staat ook in localStorage; de bestanden
 * zelf in IndexedDB.
 */
export class LocalStorageMortgageRepository implements MortgageRepository {
  private migrated = false

  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly files: FileStore = new IndexedDbFileStore(),
  ) {}

  private read<K extends keyof Tables>(table: K): Tables[K] {
    if (!this.migrated) this.migrate()
    return this.rawRead(table)
  }

  private rawRead<K extends keyof Tables>(table: K): Tables[K] {
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

  /**
   * Zet gegevens van oudere versies om (zelfde stappen als de Supabase-migraties):
   * entiteiten aanmaken, elke hypotheek één leningdeel geven met de oude hoofdsom, en
   * rentepercentages en betalingen aan dat deel koppelen.
   */
  private migrate() {
    this.migrated = true

    let entities = this.rawRead('entities')
    if (entities.length === 0) {
      const base = Date.now()
      entities = DEFAULT_ENTITY_NAMES.map((name, i) => {
        const stamp = new Date(base + i).toISOString()
        return { ...this.meta(), name, created_at: stamp, updated_at: stamp }
      })
      this.write('entities', entities)
    }

    const legacyMortgages = this.rawRead('mortgages') as LegacyMortgageRow[]
    const parts = this.rawRead('parts')
    let changedParts = false
    const mortgages: MortgageRow[] = legacyMortgages.map((m) => {
      const { principal_cents, ...row } = m
      if (principal_cents !== undefined && !parts.some((p) => p.mortgage_id === m.id)) {
        parts.push({
          ...this.meta(),
          mortgage_id: m.id,
          name: DEFAULT_PART_NAME,
          principal_cents,
          agreed_repayment_cents: 0,
          created_at: m.created_at,
          updated_at: m.created_at,
        })
        changedParts = true
      }
      return { ...row, entity_id: row.entity_id || entities[0]!.id }
    })
    const firstPart = (mortgageId: string) =>
      sortParts(parts.filter((p) => p.mortgage_id === mortgageId).map(loanPartFromRow))[0]?.id

    const rates = (this.rawRead('rates') as LegacyRateRow[]).map((r) =>
      r.loan_part_id ? r : { ...r, loan_part_id: firstPart(r.mortgage_id) ?? '' },
    )

    const lines = this.rawRead('lines')
    const payments: PaymentRow[] = (this.rawRead('payments') as LegacyPaymentRow[]).map((p) => {
      const { interest_cents, principal_cents, ...row } = p
      if (
        (interest_cents !== undefined || principal_cents !== undefined) &&
        !lines.some((l) => l.payment_id === p.id)
      ) {
        lines.push({
          ...this.meta(),
          payment_id: p.id,
          mortgage_id: p.mortgage_id,
          loan_part_id: firstPart(p.mortgage_id) ?? '',
          interest_cents: interest_cents ?? 0,
          principal_cents: principal_cents ?? 0,
          created_at: p.created_at,
        })
      }
      return row
    })

    this.write('mortgages', mortgages)
    if (changedParts) this.write('parts', parts)
    this.write('rates', rates)
    this.write('payments', payments)
    this.write('lines', lines)
  }

  private requireEntity(id: string): EntityRow {
    const row = this.read('entities').find((e) => e.id === id)
    if (!row) throw new RepositoryError('Entiteit niet gevonden.')
    return row
  }

  private requireMortgage(id: string): MortgageRow {
    const row = this.read('mortgages').find((m) => m.id === id)
    if (!row) throw new RepositoryError('Hypotheek niet gevonden.')
    return row
  }

  private requirePart(id: string): LoanPartRow {
    const row = this.read('parts').find((p) => p.id === id)
    if (!row) throw new RepositoryError('Leningdeel niet gevonden.')
    return row
  }

  private withParts(row: MortgageRow) {
    return mortgageFromRow({
      ...row,
      loan_parts: this.read('parts').filter((p) => p.mortgage_id === row.id),
    })
  }

  private withLines(row: PaymentRow) {
    return paymentFromRow({
      ...row,
      payment_lines: this.read('lines').filter((l) => l.payment_id === row.id),
    })
  }

  private assertUniqueName(name: string, exceptId?: string) {
    const taken = this.read('entities').some(
      (e) => e.id !== exceptId && e.name.trim().toLowerCase() === name.trim().toLowerCase(),
    )
    if (taken) throw new RepositoryError('Er bestaat al een entiteit met deze naam.')
  }

  // -- Entiteiten -------------------------------------------------------------

  async listEntities() {
    return this.read('entities')
      .map(entityFromRow)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async createEntity(name: string) {
    this.assertUniqueName(name)
    const row: EntityRow = { ...this.meta(), name: name.trim() }
    this.write('entities', [...this.read('entities'), row])
    return entityFromRow(row)
  }

  async renameEntity(id: string, name: string) {
    const existing = this.requireEntity(id)
    this.assertUniqueName(name, id)
    const row: EntityRow = { ...existing, name: name.trim(), updated_at: new Date().toISOString() }
    this.write(
      'entities',
      this.read('entities').map((e) => (e.id === id ? row : e)),
    )
    return entityFromRow(row)
  }

  async deleteEntity(id: string) {
    if (this.read('mortgages').some((m) => m.entity_id === id)) {
      throw new RepositoryError(
        'Deze entiteit heeft nog hypotheken. Verplaats of verwijder die eerst.',
      )
    }
    this.write(
      'entities',
      this.read('entities').filter((e) => e.id !== id),
    )
  }

  // -- Hypotheken en leningdelen ------------------------------------------------

  async listMortgages() {
    return this.read('mortgages')
      .map((m) => this.withParts(m))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async getMortgage(id: string) {
    const row = this.read('mortgages').find((m) => m.id === id)
    return row ? this.withParts(row) : null
  }

  async createMortgage(input: NewMortgageInput) {
    const { parts, ...mortgageInput } = input
    this.requireEntity(mortgageInput.entityId)
    if (parts.length === 0)
      throw new RepositoryError('Een hypotheek heeft minimaal één leningdeel.')
    const row: MortgageRow = { ...this.meta(), ...mortgageToInsert(mortgageInput) }
    // Alles eerst opbouwen, dan in één keer wegschrijven (zoals een databasetransactie).
    const base = Date.now()
    const partRows: LoanPartRow[] = parts.map((p, i) => {
      const stamp = new Date(base + i).toISOString()
      return {
        ...this.meta(),
        ...loanPartToInsert({ ...p, mortgageId: row.id }),
        created_at: stamp,
        updated_at: stamp,
      }
    })
    const rateRows: InterestRatePeriodRow[] = partRows.map((part, i) => ({
      ...this.meta(),
      ...rateToInsert({
        mortgageId: row.id,
        loanPartId: part.id,
        rateMilliPct: parts[i]!.initialRateMilliPct,
        effectiveDate: row.start_date,
      }),
    }))
    this.write('mortgages', [...this.read('mortgages'), row])
    this.write('parts', [...this.read('parts'), ...partRows])
    this.write('rates', [...this.read('rates'), ...rateRows])
    return this.withParts(row)
  }

  async updateMortgage(id: string, input: MortgageInput) {
    const existing = this.requireMortgage(id)
    this.requireEntity(input.entityId)
    const row: MortgageRow = {
      ...existing,
      ...mortgageToInsert(input),
      updated_at: new Date().toISOString(),
    }
    this.write(
      'mortgages',
      this.read('mortgages').map((m) => (m.id === id ? row : m)),
    )
    return this.withParts(row)
  }

  async setMortgageArchived(id: string, archived: boolean) {
    const existing = this.requireMortgage(id)
    const now = new Date().toISOString()
    const row: MortgageRow = { ...existing, archived_at: archived ? now : null, updated_at: now }
    this.write(
      'mortgages',
      this.read('mortgages').map((m) => (m.id === id ? row : m)),
    )
    return this.withParts(row)
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
      'parts',
      this.read('parts').filter((p) => p.mortgage_id !== id),
    )
    this.write(
      'rates',
      this.read('rates').filter((r) => r.mortgage_id !== id),
    )
    this.write(
      'payments',
      this.read('payments').filter((p) => p.mortgage_id !== id),
    )
    this.write(
      'lines',
      this.read('lines').filter((l) => l.mortgage_id !== id),
    )
  }

  async createLoanPart(input: NewLoanPartInput) {
    const mortgage = this.requireMortgage(input.mortgageId)
    const row: LoanPartRow = { ...this.meta(), ...loanPartToInsert(input) }
    const rate: InterestRatePeriodRow = {
      ...this.meta(),
      ...rateToInsert({
        mortgageId: mortgage.id,
        loanPartId: row.id,
        rateMilliPct: input.initialRateMilliPct,
        effectiveDate: mortgage.start_date,
      }),
    }
    this.write('parts', [...this.read('parts'), row])
    this.write('rates', [...this.read('rates'), rate])
    return loanPartFromRow(row)
  }

  async updateLoanPart(id: string, input: LoanPartInput) {
    const existing = this.requirePart(id)
    const row: LoanPartRow = {
      ...existing,
      ...loanPartToInsert({ ...input, mortgageId: existing.mortgage_id }),
      updated_at: new Date().toISOString(),
    }
    this.write(
      'parts',
      this.read('parts').map((p) => (p.id === id ? row : p)),
    )
    return loanPartFromRow(row)
  }

  async deleteLoanPart(id: string) {
    const part = this.requirePart(id)
    if (this.read('parts').filter((p) => p.mortgage_id === part.mortgage_id).length <= 1) {
      throw new RepositoryError('Een hypotheek heeft minimaal één leningdeel.')
    }
    if (this.read('lines').some((l) => l.loan_part_id === id)) {
      throw new RepositoryError('Er zijn al betalingen op dit leningdeel.')
    }
    this.write(
      'parts',
      this.read('parts').filter((p) => p.id !== id),
    )
    this.write(
      'rates',
      this.read('rates').filter((r) => r.loan_part_id !== id),
    )
  }

  // -- Rente --------------------------------------------------------------------

  async listRates(mortgageId?: string) {
    return this.read('rates')
      .filter((r) => !mortgageId || r.mortgage_id === mortgageId)
      .map(rateFromRow)
  }

  private assertPartOfMortgage(loanPartId: string, mortgageId: string) {
    if (this.requirePart(loanPartId).mortgage_id !== mortgageId) {
      throw new RepositoryError('Dit leningdeel hoort niet bij deze hypotheek.')
    }
  }

  async createRate(input: InterestRatePeriodInput) {
    this.requireMortgage(input.mortgageId)
    this.assertPartOfMortgage(input.loanPartId, input.mortgageId)
    const row: InterestRatePeriodRow = { ...this.meta(), ...rateToInsert(input) }
    this.write('rates', [...this.read('rates'), row])
    return rateFromRow(row)
  }

  async updateRate(id: string, input: InterestRatePeriodInput) {
    const existing = this.read('rates').find((r) => r.id === id)
    if (!existing) throw new RepositoryError('Rentewijziging niet gevonden.')
    this.assertPartOfMortgage(input.loanPartId, input.mortgageId)
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

  // -- Betalingen -----------------------------------------------------------------

  async listPayments(mortgageId?: string) {
    return this.read('payments')
      .filter((p) => !mortgageId || p.mortgage_id === mortgageId)
      .map((p) => this.withLines(p))
  }

  private buildLines(payment: PaymentRow, input: PaymentInput): PaymentLineRow[] {
    return input.lines
      .filter((l) => l.interestCents !== 0 || l.principalCents !== 0)
      .map((l) => {
        this.assertPartOfMortgage(l.loanPartId, input.mortgageId)
        return {
          ...this.meta(),
          payment_id: payment.id,
          mortgage_id: input.mortgageId,
          loan_part_id: l.loanPartId,
          interest_cents: l.interestCents,
          principal_cents: l.principalCents,
        }
      })
  }

  async createPayment(input: PaymentInput) {
    this.requireMortgage(input.mortgageId)
    const row: PaymentRow = {
      ...this.meta(),
      mortgage_id: input.mortgageId,
      payment_date: input.date,
      description: input.description,
    }
    const lines = this.buildLines(row, input)
    this.write('payments', [...this.read('payments'), row])
    this.write('lines', [...this.read('lines'), ...lines])
    return this.withLines(row)
  }

  async updatePayment(id: string, input: PaymentInput) {
    const existing = this.read('payments').find((p) => p.id === id)
    if (!existing) throw new RepositoryError('Betaling niet gevonden.')
    const row: PaymentRow = {
      ...existing,
      mortgage_id: input.mortgageId,
      payment_date: input.date,
      description: input.description,
      updated_at: new Date().toISOString(),
    }
    const lines = this.buildLines(row, input)
    this.write(
      'payments',
      this.read('payments').map((p) => (p.id === id ? row : p)),
    )
    this.write('lines', [...this.read('lines').filter((l) => l.payment_id !== id), ...lines])
    return this.withLines(row)
  }

  async deletePayment(id: string) {
    this.write(
      'payments',
      this.read('payments').filter((p) => p.id !== id),
    )
    this.write(
      'lines',
      this.read('lines').filter((l) => l.payment_id !== id),
    )
  }

  // -- Bankkoppeling: alleen online -------------------------------------------------

  async listBankConnections() {
    return []
  }

  async listBankTransactions() {
    return []
  }

  private bankUnavailable(): never {
    throw new RepositoryError(
      'De bankkoppeling werkt alleen online (met Supabase), niet in de lokale modus.',
    )
  }

  async updateBankTransaction(): Promise<void> {
    this.bankUnavailable()
  }

  async listBanks(): Promise<string[]> {
    this.bankUnavailable()
  }

  async startBankLink(): Promise<{ url: string }> {
    this.bankUnavailable()
  }

  async completeBankLink(): Promise<BankLinkResult> {
    this.bankUnavailable()
  }

  async selectBankAccount(): Promise<BankLinkResult> {
    this.bankUnavailable()
  }

  async syncBank(): Promise<{ added: number; fetched: number }> {
    this.bankUnavailable()
  }

  async disconnectBank(): Promise<void> {
    this.bankUnavailable()
  }

  // -- Documenten -----------------------------------------------------------------

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
