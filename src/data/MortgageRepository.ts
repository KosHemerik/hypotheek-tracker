import type {
  BankConnection,
  BankLinkResult,
  BankPsuType,
  BankTransaction,
  DocumentMetaInput,
  Entity,
  DocumentUploadInput,
  InterestRatePeriod,
  InterestRatePeriodInput,
  LoanPart,
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

/**
 * De enige toegang van de app tot opgeslagen data.
 *
 * Alle methodes zijn async, zodat een netwerk-backend (Supabase) dezelfde interface
 * kan implementeren. Validatie van businessregels gebeurt in `lib/validation.ts`
 * vóór een aanroep; een implementatie mag daarnaast eigen constraints afdwingen
 * (bijv. foreign keys of RLS in Supabase) en gooit dan een `RepositoryError`.
 */
export interface MortgageRepository {
  /** Entiteiten in aanmaakvolgorde. */
  listEntities(): Promise<Entity[]>
  createEntity(name: string): Promise<Entity>
  renameEntity(id: UUID, name: string): Promise<Entity>
  /** Mislukt (RepositoryError) als er nog hypotheken onder de entiteit vallen. */
  deleteEntity(id: UUID): Promise<void>

  /** Alle hypotheken van alle entiteiten; de UI filtert op de gekozen entiteit. */
  listMortgages(): Promise<Mortgage[]>
  getMortgage(id: UUID): Promise<Mortgage | null>
  /** Maakt de hypotheek aan met zijn leningdelen, elk met een rentepercentage vanaf de startdatum. */
  createMortgage(input: NewMortgageInput): Promise<Mortgage>
  updateMortgage(id: UUID, input: MortgageInput): Promise<Mortgage>
  /** Archiveren (true) of weer actief maken (false); verder blijft alles bewaard. */
  setMortgageArchived(id: UUID, archived: boolean): Promise<Mortgage>
  /** Verwijdert ook alle rentewijzigingen, betalingen en documenten (incl. bestanden). */
  deleteMortgage(id: UUID): Promise<void>

  /** Nieuw leningdeel met een eerste rentepercentage vanaf de startdatum van de hypotheek. */
  createLoanPart(input: NewLoanPartInput): Promise<LoanPart>
  /** Naam, bedrag en afgesproken aflossing aanpassen. */
  updateLoanPart(id: UUID, input: LoanPartInput): Promise<LoanPart>
  /** Alleen als het niet het laatste deel is en er geen betalingen op staan. */
  deleteLoanPart(id: UUID): Promise<void>

  /** Zonder `mortgageId`: alle rentewijzigingen van alle hypotheken. */
  listRates(mortgageId?: UUID): Promise<InterestRatePeriod[]>
  createRate(input: InterestRatePeriodInput): Promise<InterestRatePeriod>
  updateRate(id: UUID, input: InterestRatePeriodInput): Promise<InterestRatePeriod>
  deleteRate(id: UUID): Promise<void>

  /** Zonder `mortgageId`: alle betalingen van alle hypotheken, met hun regels per leningdeel. */
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

  // -- Bankkoppeling (alleen online, via de Edge Function `bank`) -------------

  listBankConnections(): Promise<BankConnection[]>
  listBankTransactions(): Promise<BankTransaction[]>
  /** Koppelt een transactie aan een betaling (of los) of markeert hem als genegeerd. */
  updateBankTransaction(
    id: UUID,
    input: { paymentId?: UUID | null; ignored?: boolean },
  ): Promise<void>
  /** Nederlandse banken die via Enable Banking te koppelen zijn (voor dit type rekening). */
  listBanks(psuType: BankPsuType): Promise<string[]>
  /** Start de toestemming bij de bank; geeft de URL van de bank-login. */
  startBankLink(input: {
    entityId: UUID
    psuType: BankPsuType
    bank: string
    redirectUrl: string
  }): Promise<{ url: string }>
  /** Rondt de toestemming af na terugkeer van de bank. */
  completeBankLink(input: { code: string; state: string }): Promise<BankLinkResult>
  /** Kiest één rekening als de toestemming er meerdere bevat. */
  selectBankAccount(connectionId: UUID, accountUid: string): Promise<BankLinkResult>
  /** Haalt nieuwe transacties en het saldo op. */
  syncBank(entityId: UUID): Promise<{ added: number; fetched: number }>
  /** Trekt de toestemming in; opgehaalde transacties blijven bewaard. */
  disconnectBank(entityId: UUID): Promise<void>
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
