/**
 * Minimale Enable Banking-client (alleen rekeninginformatie, alleen lezen).
 *
 * Draait in de Supabase Edge Function (Deno) en in de tests (Node): alleen standaard
 * web-API's (fetch, crypto.subtle, TextEncoder, atob/btoa). De private sleutel komt
 * uitsluitend uit een server-secret en verlaat de functie nooit.
 *
 * API: https://enablebanking.com/docs/api/reference/
 */

export const ENABLE_BANKING_API = 'https://api.enablebanking.com'

// ---------------------------------------------------------------------------
// JWT (RS256) voor de Authorization-header
// ---------------------------------------------------------------------------

function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let binary = ''
  for (const b of data) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PEM (PKCS#8, "BEGIN PRIVATE KEY") → CryptoKey voor RS256. */
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '')
  if (!body) throw new Error('Lege private key.')
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error(
      'De sleutel is in PKCS#1-formaat ("BEGIN RSA PRIVATE KEY"). Zet hem om naar PKCS#8 met: ' +
        'openssl pkcs8 -topk8 -nocrypt -in sleutel.pem -out sleutel-pkcs8.pem',
    )
  }
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** JWT zoals Enable Banking hem verwacht; maximaal 24 uur geldig (wij gebruiken 1 uur). */
export async function createJwt(
  appId: string,
  key: CryptoKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 3600,
): Promise<string> {
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }))
  const payload = base64url(
    JSON.stringify({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
    }),
  )
  const input = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input),
  )
  return `${input}.${base64url(new Uint8Array(signature))}`
}

// ---------------------------------------------------------------------------
// API-typen (alleen de velden die we gebruiken)
// ---------------------------------------------------------------------------

export interface EbAccount {
  uid: string
  account_id?: { iban?: string | null } | null
  name?: string | null
  currency?: string | null
}

export interface EbAspsp {
  name: string
  country: string
  psu_types?: string[]
  /** In seconden. */
  maximum_consent_validity?: number | null
}

export interface EbSession {
  session_id: string
  accounts: EbAccount[]
  access?: { valid_until?: string }
}

export interface EbTransaction {
  entry_reference?: string | null
  transaction_id?: string | null
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator?: string | null
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  remittance_information?: string[] | null
  creditor?: { name?: string | null } | null
  creditor_account?: { iban?: string | null } | null
  debtor?: { name?: string | null } | null
  debtor_account?: { iban?: string | null } | null
  status?: string | null
}

export interface EbBalance {
  balance_amount: { amount: string; currency: string }
  balance_type?: string | null
  reference_date?: string | null
}

export class EnableBankingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'EnableBankingError'
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface EnableBankingClientOptions {
  appId: string
  key: CryptoKey
  fetch?: typeof fetch
  baseUrl?: string
}

export class EnableBankingClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string

  constructor(private readonly options: EnableBankingClientOptions) {
    this.fetchImpl = options.fetch ?? fetch
    this.baseUrl = options.baseUrl ?? ENABLE_BANKING_API
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const jwt = await createJwt(this.options.appId, this.options.key)
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const json = text ? safeJson(text) : null
    if (!response.ok) {
      const detail =
        (json as { message?: string; error?: string } | null)?.message ??
        (json as { error?: string } | null)?.error ??
        text.slice(0, 200)
      throw new EnableBankingError(
        `Enable Banking ${method} ${path} → ${response.status}: ${detail}`,
        response.status,
        json,
      )
    }
    return json as T
  }

  /** Start de toestemming bij de bank; geeft de URL waar de gebruiker naartoe moet. */
  startAuthorization(input: {
    aspspName: string
    aspspCountry: string
    psuType: 'personal' | 'business'
    redirectUrl: string
    state: string
    validUntil: string
  }) {
    return this.request<{ url: string; authorization_id: string }>('POST', '/auth', {
      access: { valid_until: input.validUntil },
      aspsp: { name: input.aspspName, country: input.aspspCountry },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: input.psuType,
      language: 'nl',
    })
  }

  /** Beschikbare banken; gebruikt om de exacte naam en maximale toestemmingsduur op te halen. */
  async getAspsps(country: string, psuType: 'personal' | 'business') {
    const params = new URLSearchParams({ country, psu_type: psuType, service: 'AIS' })
    const result = await this.request<{ aspsps?: EbAspsp[] }>('GET', `/aspsps?${params}`)
    return result.aspsps ?? []
  }

  /** Wisselt de code uit de redirect in voor een sessie met rekeningen. */
  createSession(code: string) {
    return this.request<EbSession>('POST', '/sessions', { code })
  }

  /** Trekt de toestemming bij de bank in. */
  deleteSession(sessionId: string) {
    return this.request<unknown>('DELETE', `/sessions/${encodeURIComponent(sessionId)}`)
  }

  async getBalances(accountUid: string) {
    const result = await this.request<{ balances?: EbBalance[] }>(
      'GET',
      `/accounts/${encodeURIComponent(accountUid)}/balances`,
    )
    return result.balances ?? []
  }

  /** Alle transacties vanaf `dateFrom`, over alle pagina's (met een veiligheidslimiet). */
  async getTransactions(accountUid: string, dateFrom: string, maxPages = 50) {
    const all: EbTransaction[] = []
    let continuationKey: string | undefined
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({ date_from: dateFrom })
      if (continuationKey) params.set('continuation_key', continuationKey)
      const result = await this.request<{
        transactions?: EbTransaction[]
        continuation_key?: string | null
      }>('GET', `/accounts/${encodeURIComponent(accountUid)}/transactions?${params}`)
      all.push(...(result.transactions ?? []))
      if (!result.continuation_key) break
      continuationKey = result.continuation_key
    }
    return all
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Omzetten naar onze opslag
// ---------------------------------------------------------------------------

/** "1234.5" / "-12.30" → centen, zonder float-afronding. */
export function decimalToCents(value: string): number {
  const match = /^\s*(-?)(\d+)(?:\.(\d{1,2})\d*)?\s*$/.exec(value)
  if (!match) throw new Error(`Ongeldig bedrag van de bank: ${value}`)
  const [, sign, whole, fraction = ''] = match
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return sign === '-' ? -cents : cents
}

export interface NormalizedTransaction {
  external_id: string
  booking_date: string
  /** Negatief = afschrijving. */
  amount_cents: number
  currency: string
  counterparty_name: string | null
  counterparty_iban: string | null
  description: string | null
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Zet een Enable Banking-transactie om. Afschrijving = alles wat niet "CRDT" is
 * (ISO 20022 gebruikt "DBIT"). De tegenpartij is bij een afschrijving de crediteur,
 * bij een bijschrijving de debiteur. Zonder kenmerk van de bank maken we een stabiele
 * hash van de inhoud (plus volgnummer voor identieke transacties op één dag).
 */
export async function normalizeTransactions(
  transactions: readonly EbTransaction[],
): Promise<NormalizedTransaction[]> {
  const seen = new Map<string, number>()
  const result: NormalizedTransaction[] = []
  for (const t of transactions) {
    if (t.status && t.status !== 'BOOK') continue // alleen geboekte transacties
    const date = t.booking_date ?? t.value_date ?? t.transaction_date
    if (!date) continue
    const credit = t.credit_debit_indicator === 'CRDT'
    const magnitude = Math.abs(decimalToCents(t.transaction_amount.amount))
    const amount = credit ? magnitude : -magnitude
    const counterparty = credit
      ? { name: t.debtor?.name ?? null, iban: t.debtor_account?.iban ?? null }
      : { name: t.creditor?.name ?? null, iban: t.creditor_account?.iban ?? null }
    const description = (t.remittance_information ?? []).join(' ').replace(/\s+/g, ' ').trim()

    let externalId = t.entry_reference || t.transaction_id || ''
    if (!externalId) {
      const fingerprint = JSON.stringify([
        date,
        amount,
        counterparty.iban,
        counterparty.name,
        description,
      ])
      const n = (seen.get(fingerprint) ?? 0) + 1
      seen.set(fingerprint, n)
      externalId = `hash:${(await sha256Hex(fingerprint)).slice(0, 32)}:${n}`
    }

    result.push({
      external_id: externalId,
      booking_date: date.slice(0, 10),
      amount_cents: amount,
      currency: t.transaction_amount.currency || 'EUR',
      counterparty_name: counterparty.name,
      counterparty_iban: counterparty.iban ? counterparty.iban.replace(/\s+/g, '') : null,
      description: description || null,
    })
  }
  return result
}

/** Kiest het meest bruikbare saldo (geboekt of beschikbaar). */
export function pickBalance(
  balances: readonly EbBalance[],
): { cents: number; date: string | null } | null {
  const order = ['CLBD', 'ITBD', 'CLAV', 'ITAV', 'XPCD', 'OPBD']
  const sorted = [...balances].sort(
    (a, b) =>
      (order.indexOf(a.balance_type ?? '') + 1 || 99) -
      (order.indexOf(b.balance_type ?? '') + 1 || 99),
  )
  const best = sorted[0]
  if (!best) return null
  return { cents: decimalToCents(best.balance_amount.amount), date: best.reference_date ?? null }
}

/** Zoekt de Rabobank (of een andere bank) in de lijst, ongevoelig voor hoofdletters. */
export function findAspsp(aspsps: readonly EbAspsp[], name: string): EbAspsp | null {
  const wanted = name.trim().toLowerCase()
  return (
    aspsps.find((a) => a.name.toLowerCase() === wanted) ??
    aspsps.find((a) => a.name.toLowerCase().startsWith(wanted)) ??
    null
  )
}

/** Geldig-tot voor de toestemming: zo lang als de bank toestaat, maximaal 180 dagen. */
export function consentValidUntil(now: Date, maxSeconds?: number | null): string {
  const max = 180 * 24 * 3600
  const seconds = Math.min(max, maxSeconds && maxSeconds > 0 ? maxSeconds : max) - 3600
  return new Date(now.getTime() + seconds * 1000).toISOString()
}
