import type {
  DocumentMetaInput,
  DocumentUploadInput,
  InterestRatePeriod,
  InterestRatePeriodInput,
  Mortgage,
  MortgageDocument,
  MortgageInput,
  NewMortgageInput,
  Payment,
  PaymentInput,
  UUID,
} from '@/domain/types'

/**
 * De enige toegang van de app tot opgeslagen data.
 *
 * Alle methodes zijn async, zodat een netwerk-backend (Supabase) dezelfde interface
 * kan implementeren. Validatie van businessregels gebeurt in `lib/validation.ts`
 * vóór een aanroep; een implementatie mag daarnaast eigen constraints afdwingen
 * (bijv. foreign keys of RLS in Supabase) en gooit dan een `RepositoryError`.
 */
export interface MortgageRepository {
  listMortgages(): Promise<Mortgage[]>
  getMortgage(id: UUID): Promise<Mortgage | null>
  /** Maakt de hypotheek aan plus het eerste rentepercentage vanaf de startdatum. */
  createMortgage(input: NewMortgageInput): Promise<Mortgage>
  updateMortgage(id: UUID, input: MortgageInput): Promise<Mortgage>
  /** Verwijdert ook alle rentewijzigingen, betalingen en documenten (incl. bestanden). */
  deleteMortgage(id: UUID): Promise<void>

  /** Zonder `mortgageId`: alle rentewijzigingen van alle hypotheken. */
  listRates(mortgageId?: UUID): Promise<InterestRatePeriod[]>
  createRate(input: InterestRatePeriodInput): Promise<InterestRatePeriod>
  updateRate(id: UUID, input: InterestRatePeriodInput): Promise<InterestRatePeriod>
  deleteRate(id: UUID): Promise<void>

  /** Zonder `mortgageId`: alle betalingen van alle hypotheken. */
  listPayments(mortgageId?: UUID): Promise<Payment[]>
  createPayment(input: PaymentInput): Promise<Payment>
  updatePayment(id: UUID, input: PaymentInput): Promise<Payment>
  deletePayment(id: UUID): Promise<void>

  /** Zonder `mortgageId`: alle documenten van alle hypotheken (alleen metadata). */
  listDocuments(mortgageId?: UUID): Promise<MortgageDocument[]>
  /** Slaat het bestand op in de bestandsopslag én legt de metadata vast. */
  uploadDocument(input: DocumentUploadInput): Promise<MortgageDocument>
  /** Past alleen de metadata aan (naam, categorie, omschrijving). */
  updateDocument(id: UUID, input: DocumentMetaInput): Promise<MortgageDocument>
  /** Haalt de inhoud van het bestand op. */
  getDocumentFile(id: UUID): Promise<Blob>
  /** Verwijdert metadata én bestand. */
  deleteDocument(id: UUID): Promise<void>
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}
