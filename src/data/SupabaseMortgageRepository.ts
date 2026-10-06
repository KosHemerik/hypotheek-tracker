import type { SupabaseClient } from '@supabase/supabase-js'
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
import type {
  DocumentMetaInput,
  DocumentUploadInput,
  InterestRatePeriodInput,
  MortgageInput,
  NewMortgageInput,
  PaymentInput,
  UUID,
} from '@/domain/types'
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

  async listMortgages() {
    const { data, error } = await this.db
      .from('mortgages')
      .select('*')
      .order('created_at', { ascending: true })
    check(error, 'Hypotheken laden mislukt')
    return (data as MortgageRow[]).map(mortgageFromRow)
  }

  async getMortgage(id: UUID) {
    const { data, error } = await this.db.from('mortgages').select('*').eq('id', id).maybeSingle()
    check(error, 'Hypotheek laden mislukt')
    return data ? mortgageFromRow(data as MortgageRow) : null
  }

  async createMortgage(input: NewMortgageInput) {
    const { initialRateMilliPct, ...mortgageInput } = input
    const { data, error } = await this.db
      .from('mortgages')
      .insert(mortgageToInsert(mortgageInput))
      .select()
      .single()
    check(error, 'Hypotheek opslaan mislukt')
    const mortgage = mortgageFromRow(data as MortgageRow)
    try {
      await this.createRate({
        mortgageId: mortgage.id,
        rateMilliPct: initialRateMilliPct,
        effectiveDate: mortgage.startDate,
      })
    } catch (rateError) {
      // Geen half aangemaakte hypotheek achterlaten.
      await this.db.from('mortgages').delete().eq('id', mortgage.id)
      throw rateError
    }
    return mortgage
  }

  async updateMortgage(id: UUID, input: MortgageInput) {
    const { data, error } = await this.db
      .from('mortgages')
      .update(mortgageToInsert(input))
      .eq('id', id)
      .select()
      .single()
    check(error, 'Hypotheek bijwerken mislukt')
    return mortgageFromRow(data as MortgageRow)
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
    // Rentewijzigingen, betalingen en documentmetadata verdwijnen via `on delete cascade`.
    const { error } = await this.db.from('mortgages').delete().eq('id', id)
    check(error, 'Hypotheek verwijderen mislukt')
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
    check(error, 'Rentepercentage opslaan mislukt')
    return rateFromRow(data as InterestRatePeriodRow)
  }

  async updateRate(id: UUID, input: InterestRatePeriodInput) {
    const { data, error } = await this.db
      .from('interest_rate_periods')
      .update(rateToInsert(input))
      .eq('id', id)
      .select()
      .single()
    check(error, 'Rentepercentage bijwerken mislukt')
    return rateFromRow(data as InterestRatePeriodRow)
  }

  async deleteRate(id: UUID) {
    const { error } = await this.db.from('interest_rate_periods').delete().eq('id', id)
    check(error, 'Rentepercentage verwijderen mislukt')
  }

  async listPayments(mortgageId?: UUID) {
    let query = this.db.from('payments').select('*')
    if (mortgageId) query = query.eq('mortgage_id', mortgageId)
    const { data, error } = await query.order('payment_date', { ascending: true })
    check(error, 'Betalingen laden mislukt')
    return (data as PaymentRow[]).map(paymentFromRow)
  }

  async createPayment(input: PaymentInput) {
    const { data, error } = await this.db
      .from('payments')
      .insert(paymentToInsert(input))
      .select()
      .single()
    check(error, 'Betaling opslaan mislukt')
    return paymentFromRow(data as PaymentRow)
  }

  async updatePayment(id: UUID, input: PaymentInput) {
    const { data, error } = await this.db
      .from('payments')
      .update(paymentToInsert(input))
      .eq('id', id)
      .select()
      .single()
    check(error, 'Betaling bijwerken mislukt')
    return paymentFromRow(data as PaymentRow)
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

function check(error: { message: string } | null, message: string): void {
  if (error) throw new RepositoryError(`${message}: ${error.message}`, error)
}
