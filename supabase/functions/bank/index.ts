// Supabase Edge Function "bank": bankkoppeling via Enable Banking (alleen lezen).
//
// - De Enable Banking-sleutel staat alleen hier (secrets ENABLE_BANKING_APP_ID en
//   ENABLE_BANKING_PRIVATE_KEY) en gaat nooit naar de browser.
// - Elke aanroep moet van een ingelogde gebruiker komen; database-acties gebeuren met
//   díens rechten, dus Row Level Security blijft gelden.
// - Acties (POST, JSON-body met `action`): banks, start, complete, select, sync, disconnect.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  consentValidUntil,
  EnableBankingClient,
  EnableBankingError,
  findAspsp,
  importPrivateKey,
  normalizeTransactions,
  pickBalance,
  type EbAccount,
} from '../_shared/enableBanking.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Banken die gekoppeld kunnen worden. */
const SUPPORTED_BANKS = ['Rabobank', 'ING']

/** Eerste keer zo veel mogelijk historie; de bank geeft wat hij toestaat. */
const INITIAL_HISTORY_DAYS = 730
/** Overlap bij volgende syncs (dubbelen worden overgeslagen). */
const SYNC_OVERLAP_DAYS = 10

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (days: number, from = new Date()) =>
  isoDate(new Date(from.getTime() - days * 86_400_000))

let clientPromise: Promise<EnableBankingClient> | null = null
function enableBanking(): Promise<EnableBankingClient> {
  clientPromise ??= (async () => {
    const appId = Deno.env.get('ENABLE_BANKING_APP_ID')
    const pem = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY')
    if (!appId || !pem) {
      throw new HttpError(
        500,
        'De bankkoppeling is nog niet ingesteld (Enable Banking-sleutel ontbreekt).',
      )
    }
    return new EnableBankingClient({
      appId,
      key: await importPrivateKey(pem.replace(/\\n/g, '\n')),
    })
  })()
  clientPromise.catch(() => (clientPromise = null))
  return clientPromise
}

interface Connection {
  id: string
  entity_id: string
  status: string
  psu_type: 'personal' | 'business'
  aspsp_name: string
  aspsp_country: string
  session_id: string | null
  account_uid: string | null
  available_accounts: { uid: string; iban: string | null; name: string | null }[] | null
  last_synced_at: string | null
}

async function getConnection(
  db: SupabaseClient,
  column: 'entity_id' | 'auth_state' | 'id',
  value: string,
) {
  const { data, error } = await db
    .from('bank_connections')
    .select('*')
    .eq(column, value)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  return data as Connection | null
}

async function update(db: SupabaseClient, id: string, values: Record<string, unknown>) {
  const { error } = await db.from('bank_connections').update(values).eq('id', id)
  if (error) throw new HttpError(500, error.message)
}

const describeAccount = (a: EbAccount) => ({
  uid: a.uid,
  iban: a.account_id?.iban?.replace(/\s+/g, '') ?? null,
  name: a.name ?? null,
})

/** Haalt saldo en transacties op en slaat nieuwe transacties op. */
async function sync(db: SupabaseClient, userId: string, connection: Connection, firstTime = false) {
  if (!connection.account_uid) throw new HttpError(400, 'Er is nog geen rekening gekozen.')
  const eb = await enableBanking()
  const dateFrom =
    firstTime || !connection.last_synced_at
      ? daysAgo(INITIAL_HISTORY_DAYS)
      : daysAgo(SYNC_OVERLAP_DAYS, new Date(connection.last_synced_at))
  try {
    const [raw, balances] = await Promise.all([
      eb.getTransactions(connection.account_uid, dateFrom),
      eb.getBalances(connection.account_uid),
    ])
    const rows = (await normalizeTransactions(raw)).map((t) => ({
      ...t,
      user_id: userId,
      connection_id: connection.id,
      entity_id: connection.entity_id,
    }))
    let added = 0
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      // Bestaande transacties niet overschrijven (koppeling aan betaling / negeren blijft staan).
      const { data, error } = await db
        .from('bank_transactions')
        .upsert(chunk, { onConflict: 'connection_id,external_id', ignoreDuplicates: true })
        .select('id')
      if (error) throw new HttpError(500, error.message)
      added += data?.length ?? 0
    }
    const balance = pickBalance(balances)
    await update(db, connection.id, {
      status: 'active',
      last_synced_at: new Date().toISOString(),
      balance_cents: balance?.cents ?? null,
      balance_date: balance?.date ?? isoDate(new Date()),
      last_error: null,
    })
    return { added, fetched: rows.length }
  } catch (error) {
    if (error instanceof EnableBankingError && [401, 403, 404, 422].includes(error.status)) {
      await update(db, connection.id, {
        status: 'expired',
        last_error:
          'De toestemming van de bank is verlopen of ingetrokken. Koppel de rekening opnieuw.',
      })
      throw new HttpError(
        409,
        'De toestemming van de bank is verlopen. Koppel de rekening opnieuw.',
      )
    }
    throw error
  }
}

async function handle(db: SupabaseClient, userId: string, body: Record<string, unknown>) {
  const action = String(body.action ?? '')

  if (action === 'banks') {
    // Alleen Rabobank en ING, met de exacte namen zoals Enable Banking ze kent.
    const psuType = body.psuType === 'business' ? 'business' : 'personal'
    const eb = await enableBanking()
    const list = await eb.getAspsps('NL', psuType)
    const banks = SUPPORTED_BANKS.map((name) => findAspsp(list, name)?.name).filter(
      (name): name is string => !!name,
    )
    return { banks }
  }

  if (action === 'start') {
    const entityId = String(body.entityId ?? '')
    const psuType = body.psuType === 'business' ? 'business' : 'personal'
    const redirectUrl = String(body.redirectUrl ?? '')
    if (!entityId || !/^https?:\/\//.test(redirectUrl))
      throw new HttpError(400, 'Ongeldig verzoek.')

    const bank = String(body.bank ?? '').trim() || 'Rabobank'
    if (!SUPPORTED_BANKS.some((name) => bank.toLowerCase().startsWith(name.toLowerCase()))) {
      throw new HttpError(400, 'Kies Rabobank of ING.')
    }
    const eb = await enableBanking()
    // Alleen banken die Enable Banking voor dit type rekening aanbiedt.
    const aspsp = findAspsp(await eb.getAspsps('NL', psuType), bank)
    if (!aspsp) throw new HttpError(400, `${bank} is niet beschikbaar voor dit type rekening.`)

    const state = crypto.randomUUID()
    const existing = await getConnection(db, 'entity_id', entityId)
    const values = {
      entity_id: entityId,
      psu_type: psuType,
      aspsp_name: aspsp.name,
      aspsp_country: aspsp.country,
      auth_state: state,
      last_error: null,
      // Bestaande koppeling blijft actief tot de nieuwe toestemming rond is.
      ...(existing ? {} : { status: 'pending' }),
    }
    if (existing) await update(db, existing.id, values)
    else {
      const { error } = await db.from('bank_connections').insert(values)
      if (error) throw new HttpError(403, 'Deze entiteit is niet van jou of bestaat niet.')
    }

    const auth = await eb.startAuthorization({
      aspspName: aspsp.name,
      aspspCountry: aspsp.country,
      psuType,
      redirectUrl,
      state,
      validUntil: consentValidUntil(new Date(), aspsp.maximum_consent_validity),
    })
    return { url: auth.url }
  }

  if (action === 'complete') {
    const state = String(body.state ?? '')
    const code = String(body.code ?? '')
    const connection = state ? await getConnection(db, 'auth_state', state) : null
    if (!connection) throw new HttpError(404, 'Deze koppeling is niet gevonden of al afgerond.')
    if (!code) throw new HttpError(400, 'De bank heeft geen toestemming gegeven.')

    const eb = await enableBanking()
    const session = await eb.createSession(code)
    // Oude toestemming (bij verlengen) netjes intrekken.
    if (connection.session_id && connection.session_id !== session.session_id) {
      await eb.deleteSession(connection.session_id).catch(() => undefined)
    }
    const accounts = session.accounts.map(describeAccount)
    const base = {
      auth_state: null,
      session_id: session.session_id,
      valid_until: session.access?.valid_until ?? null,
      available_accounts: accounts,
    }
    if (accounts.length === 0) {
      await update(db, connection.id, {
        ...base,
        status: 'error',
        last_error: 'Geen rekeningen gevonden.',
      })
      throw new HttpError(
        400,
        'Er zijn geen rekeningen gedeeld. Koppel opnieuw en kies een rekening.',
      )
    }

    // Bij verlengen dezelfde rekening houden (op IBAN), anders: één rekening → direct actief.
    const previous = accounts.find(
      (a) =>
        a.iban &&
        connection.available_accounts?.some(
          (p) => p.uid === connection.account_uid && p.iban === a.iban,
        ),
    )
    const chosen = previous ?? (accounts.length === 1 ? accounts[0] : null)
    if (!chosen) {
      await update(db, connection.id, { ...base, status: 'choose_account', account_uid: null })
      return { entityId: connection.entity_id, status: 'choose_account', accounts }
    }
    await update(db, connection.id, {
      ...base,
      status: 'active',
      account_uid: chosen.uid,
      iban: chosen.iban,
      account_name: chosen.name,
    })
    // Direct na de bank-login mag de meeste historie opgehaald worden.
    const result = await sync(db, userId, { ...connection, account_uid: chosen.uid }, true)
    return { entityId: connection.entity_id, status: 'active', ...result }
  }

  if (action === 'select') {
    const connection = await getConnection(db, 'id', String(body.connectionId ?? ''))
    if (!connection || connection.status !== 'choose_account') {
      throw new HttpError(404, 'Er is geen rekening om te kiezen.')
    }
    const chosen = connection.available_accounts?.find((a) => a.uid === body.accountUid)
    if (!chosen) throw new HttpError(400, 'Deze rekening hoort niet bij de toestemming.')
    await update(db, connection.id, {
      status: 'active',
      account_uid: chosen.uid,
      iban: chosen.iban,
      account_name: chosen.name,
    })
    const result = await sync(db, userId, { ...connection, account_uid: chosen.uid }, true)
    return { entityId: connection.entity_id, status: 'active', ...result }
  }

  if (action === 'sync') {
    const connection = await getConnection(db, 'entity_id', String(body.entityId ?? ''))
    if (!connection || connection.status !== 'active') {
      throw new HttpError(404, 'Er is geen actieve bankkoppeling voor deze entiteit.')
    }
    return sync(db, userId, connection)
  }

  if (action === 'disconnect') {
    const connection = await getConnection(db, 'entity_id', String(body.entityId ?? ''))
    if (!connection) return { ok: true }
    if (connection.session_id) {
      const eb = await enableBanking()
      await eb.deleteSession(connection.session_id).catch(() => undefined)
    }
    // Transacties blijven bewaard (ze kunnen aan betalingen gekoppeld zijn).
    await update(db, connection.id, {
      status: 'revoked',
      session_id: null,
      account_uid: null,
      available_accounts: null,
      auth_state: null,
      valid_until: null,
    })
    return { ok: true }
  }

  throw new HttpError(400, `Onbekende actie: ${action}`)
}

/** Bekende Enable Banking-fouten in begrijpelijke taal; anders een algemene melding. */
function friendlyEnableBankingError(error: EnableBankingError): string {
  const text = error.message.toLowerCase()
  if (text.includes('not active')) {
    return 'De Enable Banking-applicatie is nog niet geactiveerd. Activeer hem in het Enable Banking Control Panel via "Activate by linking accounts".'
  }
  if (text.includes('redirect')) {
    return "Het terugkeeradres is niet toegestaan. Voeg https://localhost:5173/bank/callback toe bij de redirect-URL's in het Enable Banking Control Panel."
  }
  if (error.status === 401) {
    return 'Enable Banking accepteert de sleutel niet. Controleer het application id en de private key.'
  }
  if (error.status === 429) {
    return 'Te veel verzoeken bij Enable Banking. Probeer het over een paar minuten opnieuw.'
  }
  return 'De bank of Enable Banking gaf een fout. Probeer het later opnieuw.'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Alleen POST.' }, 405)

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Niet ingelogd.' }, 401)

  // Database-client met de rechten van de ingelogde gebruiker (RLS blijft gelden).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userError } = await db.auth.getUser(authorization.slice(7))
  if (userError || !userData.user) return json({ error: 'Niet ingelogd.' }, 401)

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return json(await handle(db, userData.user.id, body))
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof EnableBankingError) {
      console.error(error.message)
      return json({ error: friendlyEnableBankingError(error) }, 502)
    }
    console.error(error)
    return json({ error: 'Er ging iets mis bij de bankkoppeling.' }, 500)
  }
})
