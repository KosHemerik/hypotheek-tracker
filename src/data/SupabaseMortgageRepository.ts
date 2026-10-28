import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BankConnectionRow,
  BankTransactionRow,
  EntityRow,
  InterestRatePeriodRow,
  LoanPartRow,
  MortgageDocumentRow,
  MortgageWithPartsRow,
  PaymentWithLinesRow,
} from '@/domain/db-types'
import {
  BANK_CONNECTION_COLUMNS,
  bankConnectionFromRow,
  bankTransactionFromRow,
  documentFromRow,
  documentMetaToUpdate,
  entityFromRow,
  loanPartFromRow,
  milliToRatePercentage,
  mortgageFromRow,
  mortgageToInsert,
  paymentFromRow,
  paymentLinesToJson,
  rateFromRow,
  rateToInsert,
} from '@/domain/mappers'
import type {
  BankLinkResult,
  BankPsuType,
  DocumentMetaInput,
  DocumentUploadInput,
  InterestRatePeriodInput,
  LoanPartInput,
  MortgageInput,
  NewLoanPartInput,
  NewMortgageInput,
  PaymentInput,
  UUID,
} from '@/domain/types'

const MORTGAGE_SELECT = '*, loan_parts(*)'
const PAYMENT_SELECT = '*, payment_lines(*)'
import { RepositoryError, type MortgageRepository } from './MortgageRepository'

/** Private bucket; zie `supabase/migrations/…_documents.sql`. */
export const DOCUMENTS_BUCKET = 'mortgage-documents'

/**
 * Supabase-implementatie van de repository. Wordt alleen gebruikt als
 * `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` gezet zijn (zie `createRepository.ts`).
 *
 * Vereist het schema uit `supabase/migrations/` en een ingelogde gebruiker:
 * `user_id` wordt door de database gevuld (`default auth.uid()`) en Row Level Security
 * zorgt dat iedere gebruiker alleen zijn eigen rijen ziet.
 */
export class SupabaseMortgageRepository implements MortgageRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listEntities() {
    const { data, error } = await this.db
      .from('entities')
      .select('*')
      .order('created_at', { ascending: true })
    check(error, 'Entiteiten laden mislukt')
    return (data as EntityRow[]).map(entityFromRow)
  }

  async createEntity(name: string) {
    const { data, error } = await this.db
      .from('entities')
      .insert({ name: name.trim() })
      .select()
      .single()
    check(error, 'Entiteit opslaan mislukt', { '23505': ENTITY_EXISTS })
    return entityFromRow(data as EntityRow)
  }

  async renameEntity(id: UUID, name: string) {
    const { data, error } = await this.db
      .from('entities')
      .update({ name: name.trim() })
      .eq('id', id)
      .select()
      .single()
    check(error, 'Entiteit hernoemen mislukt', { '23505': ENTITY_EXISTS })
    return entityFromRow(data as EntityRow)
  }

  async deleteEntity(id: UUID) {
    const { error } = await this.db.from('entities').delete().eq('id', id)
    check(error, 'Entiteit verwijderen mislukt', {
      '23503': 'Deze entiteit heeft nog hypotheken. Verplaats of verwijder die eerst.',
    })
  }

  async listMortgages() {
    const { data, error } = await this.db
      .from('mortgages')
      .select(MORTGAGE_SELECT)
      .order('created_at', { ascending: true })
    check(error, 'Hypotheken laden mislukt')
    return (data as MortgageWithPartsRow[]).map(mortgageFromRow)
  }

  async getMortgage(id: UUID) {
    const { data, error } = await this.db
      .from('mortgages')
      .select(MORTGAGE_SELECT)
      .eq('id', id)
      .maybeSingle()
    check(error, 'Hypotheek laden mislukt')
    return data ? mortgageFromRow(data as MortgageWithPartsRow) : null
  }

  private async requireMortgage(id: UUID) {
    const mortgage = await this.getMortgage(id)
    if (!mortgage) throw new RepositoryError('Hypotheek niet gevonden.')
    return mortgage
  }

  async createMortgage(input: NewMortgageInput) {
    const { parts, ...mortgageInput } = input
    // Eén transactie in de database: hypotheek, delen en startrentes (zie migratie).
    const { data, error } = await this.db.rpc('create_mortgage', {
      p_mortgage: mortgageToInsert(mortgageInput),
      p_parts: parts.map((p) => ({
        name: p.name,
        principal_cents: p.principalCents,
        agreed_repayment_cents: p.agreedRepaymentCents,
        rate_percentage: milliToRatePercentage(p.initialRateMilliPct),
      })),
    })
    check(error, 'Hypotheek opslaan mislukt', { '23505': PART_EXISTS })
    return this.requireMortgage(data as string)
  }

  async updateMortgage(id: UUID, input: MortgageInput) {
    const { error } = await this.db.from('mortgages').update(mortgageToInsert(input)).eq('id', id)
    check(error, 'Hypotheek bijwerken mislukt')
    return this.requireMortgage(id)
  }

  async setMortgageArchived(id: UUID, archived: boolean) {
    const { error } = await this.db
      .from('mortgages')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
    check(error, archived ? 'Archiveren mislukt' : 'Dearchiveren mislukt')
    return this.requireMortgage(id)
  }

  async deleteMortgage(id: UUID) {
    // Bestanden in Storage cascaden niet mee: eerst zelf opruimen.
    const docs = await this.listDocuments(id)
    if (docs.length > 0) {
      const { error: storageError } = await this.db.storage
        .from(DOCUMENTS_BUCKET)
        .remove(docs.map((d) => d.storagePath))
      check(storageError, 'Documenten verwijderen mislukt')
    }
    // Leningdelen, rente, betalingen en documentmetadata verdwijnen via `on delete cascade`.
    const { error } = await this.db.from('mortgages').delete().eq('id', id)
    check(error, 'Hypotheek verwijderen mislukt')
  }

  async createLoanPart(input: NewLoanPartInput) {
    const { data, error } = await this.db.rpc('create_loan_part', {
      p_mortgage_id: input.mortgageId,
      p_part: {
        name: input.name,
        principal_cents: input.principalCents,
        agreed_repayment_cents: input.agreedRepaymentCents,
        rate_percentage: milliToRatePercentage(input.initialRateMilliPct),
      },
    })
    check(error, 'Leningdeel opslaan mislukt', { '23505': PART_EXISTS })
    return this.getLoanPart(data as string)
  }

  async updateLoanPart(id: UUID, input: LoanPartInput) {
    const { data, error } = await this.db
      .from('loan_parts')
      .update({
        name: input.name,
        principal_cents: input.principalCents,
        agreed_repayment_cents: input.agreedRepaymentCents,
      })
      .eq('id', id)
      .select()
      .single()
    check(error, 'Leningdeel bijwerken mislukt', { '23505': PART_EXISTS })
    return loanPartFromRow(data as LoanPartRow)
  }

  async deleteLoanPart(id: UUID) {
    const part = await this.getLoanPart(id)
    const { count, error: countError } = await this.db
      .from('loan_parts')
      .select('id', { count: 'exact', head: true })
      .eq('mortgage_id', part.mortgageId)
    check(countError, 'Leningdeel verwijderen mislukt')
    if ((count ?? 0) <= 1) throw new RepositoryError('Een hypotheek heeft minimaal één leningdeel.')
    const { error } = await this.db.from('loan_parts').delete().eq('id', id)
    check(error, 'Leningdeel verwijderen mislukt', {
      '23503': 'Er zijn al betalingen op dit leningdeel. Verwijder of wijzig die eerst.',
    })
  }

  private async getLoanPart(id: UUID) {
    const { data, error } = await this.db.from('loan_parts').select('*').eq('id', id).single()
    check(error, 'Leningdeel niet gevonden')
    return loanPartFromRow(data as LoanPartRow)
  }

  async listRates(mortgageId?: UUID) {
    let query = this.db.from('interest_rate_periods').select('*')
    if (mortgageId) query = query.eq('mortgage_id', mortgageId)
    const { data, error } = await query.order('effective_date', { ascending: true })
    check(error, 'Rentepercentages laden mislukt')
    return (data as InterestRatePeriodRow[]).map(rateFromRow)
  }

  async createRate(input: InterestRatePeriodInput) {
    const { data, error } = await this.db
      .from('interest_rate_periods')
      .insert(rateToInsert(input))
      .select()
      .single()
    check(error, 'Rentepercentage opslaan mislukt', { '23505': RATE_EXISTS })
    return rateFromRow(data as InterestRatePeriodRow)
  }

  async updateRate(id: UUID, input: InterestRatePeriodInput) {
    const { data, error } = await this.db
      .from('interest_rate_periods')
      .update(rateToInsert(input))
      .eq('id', id)
      .select()
      .single()
    check(error, 'Rentepercentage bijwerken mislukt', { '23505': RATE_EXISTS })
    return rateFromRow(data as InterestRatePeriodRow)
  }

  async deleteRate(id: UUID) {
    const { error } = await this.db.from('interest_rate_periods').delete().eq('id', id)
    check(error, 'Rentepercentage verwijderen mislukt')
  }

  async listPayments(mortgageId?: UUID) {
    let query = this.db.from('payments').select(PAYMENT_SELECT)
    if (mortgageId) query = query.eq('mortgage_id', mortgageId)
    const { data, error } = await query.order('payment_date', { ascending: true })
    check(error, 'Betalingen laden mislukt')
    return (data as PaymentWithLinesRow[]).map(paymentFromRow)
  }

  /** Betaling + regels in één transactie (database-functie `save_payment`). */
  private async savePayment(id: UUID | null, input: PaymentInput) {
    const { data, error } = await this.db.rpc('save_payment', {
      p_id: id,
      p_mortgage_id: input.mortgageId,
      p_date: input.date,
      p_description: input.description,
      p_lines: paymentLinesToJson(input.lines),
    })
    check(error, 'Betaling opslaan mislukt')
    const { data: row, error: readError } = await this.db
      .from('payments')
      .select(PAYMENT_SELECT)
      .eq('id', data as string)
      .single()
    check(readError, 'Betaling laden mislukt')
    return paymentFromRow(row as PaymentWithLinesRow)
  }

  async createPayment(input: PaymentInput) {
    return this.savePayment(null, input)
  }

  async updatePayment(id: UUID, input: PaymentInput) {
    return this.savePayment(id, input)
  }

  async deletePayment(id: UUID) {
    const { error } = await this.db.from('payments').delete().eq('id', id)
    check(error, 'Betaling verwijderen mislukt')
  }

  async listDocuments(mortgageId?: UUID) {
    let query = this.db.from('mortgage_documents').select('*')
    if (mortgageId) query = query.eq('mortgage_id', mortgageId)
    const { data, error } = await query.order('created_at', { ascending: true })
    check(error, 'Documenten laden mislukt')
    return (data as MortgageDocumentRow[]).map(documentFromRow)
  }

  async uploadDocument(input: DocumentUploadInput) {
    const { data: auth, error: authError } = await this.db.auth.getUser()
    check(authError, 'Niet ingelogd')
    if (!auth.user) throw new RepositoryError('Log in om documenten te uploaden.')

    const id = crypto.randomUUID()
    // Eerste mapnaam = user id: daarop controleren de Storage-policies.
    const storagePath = `${auth.user.id}/${input.mortgageId}/${id}/${storageSafeName(input.file.name)}`
    const contentType = input.file.type || 'application/octet-stream'

    const { error: uploadError } = await this.db.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, input.file, { contentType, upsert: false })
    check(uploadError, 'Bestand uploaden mislukt')

    const { data, error } = await this.db
      .from('mortgage_documents')
      .insert({
        id,
        mortgage_id: input.mortgageId,
        file_name: input.file.name,
        mime_type: contentType,
        size_bytes: input.file.size,
        category: input.category,
        description: input.description,
        storage_path: storagePath,
      })
      .select()
      .single()
    if (error) {
      await this.db.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
      check(error, 'Document opslaan mislukt')
    }
    return documentFromRow(data as MortgageDocumentRow)
  }

  async updateDocument(id: UUID, input: DocumentMetaInput) {
    const { data, error } = await this.db
      .from('mortgage_documents')
      .update(documentMetaToUpdate(input))
      .eq('id', id)
      .select()
      .single()
    check(error, 'Document bijwerken mislukt')
    return documentFromRow(data as MortgageDocumentRow)
  }

  async getDocumentFile(id: UUID) {
    const doc = await this.getDocumentRow(id)
    const { data, error } = await this.db.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path)
    check(error, 'Bestand downloaden mislukt')
    return data as Blob
  }

  async deleteDocument(id: UUID) {
    const doc = await this.getDocumentRow(id)
    const { error } = await this.db.from('mortgage_documents').delete().eq('id', id)
    check(error, 'Document verwijderen mislukt')
    const { error: storageError } = await this.db.storage
      .from(DOCUMENTS_BUCKET)
      .remove([doc.storage_path])
    check(storageError, 'Bestand verwijderen mislukt')
  }

  private async getDocumentRow(id: UUID): Promise<MortgageDocumentRow> {
    const { data, error } = await this.db
      .from('mortgage_documents')
      .select('*')
      .eq('id', id)
      .single()
    check(error, 'Document niet gevonden')
    return data as MortgageDocumentRow
  }

  // -- Bankkoppeling ---------------------------------------------------------------

  async listBankConnections() {
    const { data, error } = await this.db.from('bank_connections').select(BANK_CONNECTION_COLUMNS)
    check(error, 'Bankkoppelingen laden mislukt')
    return (data as unknown as BankConnectionRow[]).map(bankConnectionFromRow)
  }

  async listBankTransactions() {
    // PostgREST geeft maximaal 1000 rijen per verzoek: in pagina's ophalen.
    const pageSize = 1000
    const rows: BankTransactionRow[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.db
        .from('bank_transactions')
        .select(
          'id, entity_id, connection_id, booking_date, amount_cents, currency, counterparty_name, counterparty_iban, description, payment_id, ignored',
        )
        .order('booking_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      check(error, 'Banktransacties laden mislukt')
      rows.push(...(data as BankTransactionRow[]))
      if (!data || data.length < pageSize) break
    }
    return rows.map(bankTransactionFromRow)
  }

  async updateBankTransaction(id: UUID, input: { paymentId?: UUID | null; ignored?: boolean }) {
    const values: Record<string, unknown> = {}
    if (input.paymentId !== undefined) values.payment_id = input.paymentId
    if (input.ignored !== undefined) values.ignored = input.ignored
    const { error } = await this.db.from('bank_transactions').update(values).eq('id', id)
    check(error, 'Banktransactie bijwerken mislukt')
  }

  /** Roept de Edge Function `bank` aan met de sessie van de ingelogde gebruiker. */
  private async bank<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke('bank', { body })
    if (error) {
      // Bij een HTTP-fout staat de leesbare melding in de body van de functie.
      let message = 'De bankkoppeling gaf een fout.'
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        const payload = (await context.json().catch(() => null)) as { error?: string } | null
        if (payload?.error) message = payload.error
      }
      throw new RepositoryError(message, error)
    }
    return data as T
  }

  async listBanks(psuType: BankPsuType) {
    const result = await this.bank<{ banks: string[] }>({ action: 'banks', psuType })
    return result.banks
  }

  startBankLink(input: {
    entityId: UUID
    psuType: BankPsuType
    bank: string
    redirectUrl: string
  }) {
    return this.bank<{ url: string }>({ action: 'start', ...input })
  }

  completeBankLink(input: { code: string; state: string }) {
    return this.bank<BankLinkResult>({ action: 'complete', ...input })
  }

  selectBankAccount(connectionId: UUID, accountUid: string) {
    return this.bank<BankLinkResult>({ action: 'select', connectionId, accountUid })
  }

  syncBank(entityId: UUID) {
    return this.bank<{ added: number; fetched: number }>({ action: 'sync', entityId })
  }

  async disconnectBank(entityId: UUID) {
    await this.bank({ action: 'disconnect', entityId })
  }
}

/** Storage-sleutels mogen geen willekeurige tekens bevatten; de echte naam staat in `file_name`. */
function storageSafeName(name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe.slice(-100) || 'bestand'
}

const ENTITY_EXISTS = 'Er bestaat al een entiteit met deze naam.'
const PART_EXISTS = 'Er is al een leningdeel met deze naam bij deze hypotheek.'
const RATE_EXISTS = 'Er is al een rentepercentage met deze ingangsdatum.'

/**
 * Gooit een RepositoryError bij een fout. Bekende Postgres-codes (23505 = uniek,
 * 23503 = foreign key) krijgen per aanroep een begrijpelijke melding.
 */
function check(
  error: { message: string; code?: string } | null,
  message: string,
  known: Partial<Record<'23505' | '23503', string>> = {},
): void {
  if (!error) return
  const friendly = error.code ? known[error.code as '23505' | '23503'] : undefined
  throw new RepositoryError(friendly ?? `${message}: ${error.message}`, error)
}
