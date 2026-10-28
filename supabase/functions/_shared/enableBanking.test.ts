import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createJwt,
  decimalToCents,
  EnableBankingClient,
  EnableBankingError,
  importPrivateKey,
  normalizeTransactions,
  pickBalance,
  type EbTransaction,
} from './enableBanking.ts'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

describe('JWT', () => {
  it('maakt een RS256-JWT met de velden die Enable Banking verwacht en een geldige handtekening', async () => {
    const key = await importPrivateKey(pem)
    const jwt = await createJwt('app-123', key, 1_700_000_000)
    const [h, p, s] = jwt.split('.')
    expect(decode(h!)).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-123' })
    expect(decode(p!)).toEqual({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
    const valid = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      publicKey,
      Buffer.from(s!, 'base64url'),
    )
    expect(valid).toBe(true)
  })

  it('geeft een duidelijke melding bij een PKCS#1-sleutel', async () => {
    const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    await expect(importPrivateKey(pkcs1)).rejects.toThrow(/PKCS#8/)
  })
})

describe('decimalToCents', () => {
  it.each([
    ['1234.56', 1234_56],
    ['-12.3', -12_30],
    ['0.05', 5],
    ['100', 100_00],
    ['1.239', 1_23],
  ])('%s → %i', (input, expected) => {
    expect(decimalToCents(input)).toBe(expected)
  })

  it('weigert onzin', () => {
    expect(() => decimalToCents('1,23')).toThrow()
  })
})

describe('normalizeTransactions', () => {
  const base: EbTransaction = {
    transaction_amount: { amount: '1290.34', currency: 'EUR' },
    credit_debit_indicator: 'DBIT',
    booking_date: '2026-10-01',
    remittance_information: ['Termijn hypotheek', ' 01-10-2026 '],
    creditor: { name: 'Rabobank Hypotheken' },
    creditor_account: { iban: 'NL01 RABO 0123 4567 89' },
    status: 'BOOK',
  }

  it('maakt afschrijvingen negatief en neemt de crediteur als tegenpartij', async () => {
    const [t] = await normalizeTransactions([{ ...base, entry_reference: 'ref-1' }])
    expect(t).toEqual({
      external_id: 'ref-1',
      booking_date: '2026-10-01',
      amount_cents: -1290_34,
      currency: 'EUR',
      counterparty_name: 'Rabobank Hypotheken',
      counterparty_iban: 'NL01RABO0123456789',
      description: 'Termijn hypotheek 01-10-2026',
    })
  })

  it('maakt bijschrijvingen positief met de debiteur als tegenpartij', async () => {
    const [t] = await normalizeTransactions([
      {
        ...base,
        entry_reference: 'ref-2',
        credit_debit_indicator: 'CRDT',
        debtor: { name: 'Tom' },
        debtor_account: { iban: 'NL99BANK0000000001' },
      },
    ])
    expect(t).toMatchObject({ amount_cents: 1290_34, counterparty_name: 'Tom' })
  })

  it('slaat niet-geboekte transacties over en maakt stabiele kenmerken zonder bankreferentie', async () => {
    const list = await normalizeTransactions([base, base, { ...base, status: 'PDNG' }])
    expect(list).toHaveLength(2)
    expect(list[0]!.external_id).toMatch(/^hash:[0-9a-f]{32}:1$/)
    expect(list[1]!.external_id).toMatch(/:2$/)
    const again = await normalizeTransactions([base])
    expect(again[0]!.external_id).toBe(list[0]!.external_id)
  })
})

describe('pickBalance', () => {
  it('kiest het geboekte saldo boven het beschikbare', () => {
    expect(
      pickBalance([
        { balance_amount: { amount: '900.00', currency: 'EUR' }, balance_type: 'ITAV' },
        {
          balance_amount: { amount: '1000.00', currency: 'EUR' },
          balance_type: 'CLBD',
          reference_date: '2026-10-06',
        },
      ]),
    ).toEqual({ cents: 1000_00, date: '2026-10-06' })
    expect(pickBalance([])).toBeNull()
  })
})

describe('EnableBankingClient', () => {
  async function client(handler: (url: URL, init: RequestInit) => Response) {
    const calls: { url: URL; init: RequestInit }[] = []
    const fakeFetch = (async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input))
      calls.push({ url, init })
      return handler(url, init)
    }) as typeof fetch
    const key = await importPrivateKey(pem)
    return { calls, eb: new EnableBankingClient({ appId: 'app-1', key, fetch: fakeFetch }) }
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('start een autorisatie met de juiste body en een Bearer-JWT', async () => {
    const { calls, eb } = await client(() => json({ url: 'https://bank/x', authorization_id: 'a' }))
    const result = await eb.startAuthorization({
      aspspName: 'Rabobank',
      aspspCountry: 'NL',
      psuType: 'business',
      redirectUrl: 'https://app/bank/callback',
      state: 's1',
      validUntil: '2027-04-01T00:00:00Z',
    })
    expect(result.url).toBe('https://bank/x')
    expect(calls[0]!.url.pathname).toBe('/auth')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      access: { valid_until: '2027-04-01T00:00:00Z' },
      aspsp: { name: 'Rabobank', country: 'NL' },
      state: 's1',
      redirect_url: 'https://app/bank/callback',
      psu_type: 'business',
      language: 'nl',
    })
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer ey/)
  })

  it('haalt transacties over meerdere pagina’s op', async () => {
    const { calls, eb } = await client((url) =>
      url.searchParams.get('continuation_key')
        ? json({
            transactions: [
              { entry_reference: 'b', transaction_amount: { amount: '2', currency: 'EUR' } },
            ],
          })
        : json({
            transactions: [
              { entry_reference: 'a', transaction_amount: { amount: '1', currency: 'EUR' } },
            ],
            continuation_key: 'next',
          }),
    )
    const list = await eb.getTransactions('acc 1', '2025-01-01')
    expect(list.map((t) => t.entry_reference)).toEqual(['a', 'b'])
    expect(calls[0]!.url.pathname).toBe('/accounts/acc%201/transactions')
    expect(calls[0]!.url.searchParams.get('date_from')).toBe('2025-01-01')
    expect(calls[1]!.url.searchParams.get('continuation_key')).toBe('next')
  })

  it('geeft fouten van de API door met status en melding', async () => {
    const { eb } = await client(() => json({ message: 'Session expired' }, 401))
    const error = await eb.createSession('code').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EnableBankingError)
    expect((error as EnableBankingError).status).toBe(401)
    expect((error as Error).message).toMatch(/Session expired/)
  })
})
