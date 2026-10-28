import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryFileStore } from './fileStore'
import { LocalStorageMortgageRepository } from './LocalStorageMortgageRepository'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

describe('LocalStorageMortgageRepository – documenten', () => {
  let files: MemoryFileStore
  let repo: LocalStorageMortgageRepository

  beforeEach(() => {
    files = new MemoryFileStore()
    repo = new LocalStorageMortgageRepository(new MemoryStorage(), files)
  })

  async function createMortgage() {
    const [entity] = await repo.listEntities()
    return repo.createMortgage({
      entityId: entity!.id,
      name: 'Test',
      mortgageNumber: '1',
      startDate: '2025-01-01',
      endDate: null,
      notes: null,
      counterpartyIban: null,
      interestMethod: 'actual',
      dueDay: null,
      parts: [
        {
          name: 'Deel 1',
          principalCents: 100_000_00,
          agreedRepaymentCents: 0,
          initialRateMilliPct: 3000,
        },
      ],
    })
  }

  it('slaat metadata en bestand op en geeft het bestand terug', async () => {
    const mortgage = await createMortgage()
    const file = new File(['%PDF-1.7 test'], 'Akte.pdf', { type: 'application/pdf' })
    const doc = await repo.uploadDocument({
      mortgageId: mortgage.id,
      file,
      category: 'deed',
      description: null,
    })

    expect(doc).toMatchObject({
      mortgageId: mortgage.id,
      fileName: 'Akte.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 13,
      category: 'deed',
    })
    expect(await repo.listDocuments(mortgage.id)).toHaveLength(1)
    expect(await (await repo.getDocumentFile(doc.id)).text()).toBe('%PDF-1.7 test')
  })

  it('past metadata aan zonder het bestand te raken', async () => {
    const mortgage = await createMortgage()
    const doc = await repo.uploadDocument({
      mortgageId: mortgage.id,
      file: new File(['x'], 'scan.pdf', { type: 'application/pdf' }),
      category: 'other',
      description: null,
    })
    const updated = await repo.updateDocument(doc.id, {
      fileName: 'Jaaroverzicht 2025.pdf',
      category: 'annual_statement',
      description: 'Voor de aangifte',
    })
    expect(updated).toMatchObject({
      fileName: 'Jaaroverzicht 2025.pdf',
      category: 'annual_statement',
    })
    expect(updated.storagePath).toBe(doc.storagePath)
    expect(await (await repo.getDocumentFile(doc.id)).text()).toBe('x')
  })

  it('verwijdert bestanden mee bij verwijderen van document en hypotheek', async () => {
    const a = await createMortgage()
    const b = await createMortgage()
    const upload = (mortgageId: string, name: string) =>
      repo.uploadDocument({
        mortgageId,
        file: new File(['x'], name),
        category: 'other',
        description: null,
      })

    const docA1 = await upload(a.id, 'a1.pdf')
    await upload(a.id, 'a2.pdf')
    await upload(b.id, 'b1.pdf')
    expect(files.files.size).toBe(3)

    await repo.deleteDocument(docA1.id)
    expect(files.files.size).toBe(2)

    await repo.deleteMortgage(a.id)
    expect(await repo.listDocuments()).toHaveLength(1)
    expect(files.files.size).toBe(1)
  })

  it('weigert uploads bij een onbekende hypotheek', async () => {
    await expect(
      repo.uploadDocument({
        mortgageId: 'bestaat-niet',
        file: new File(['x'], 'a.pdf'),
        category: 'other',
        description: null,
      }),
    ).rejects.toThrow('Hypotheek niet gevonden.')
    expect(files.files.size).toBe(0)
  })
})

describe('LocalStorageMortgageRepository – entiteiten', () => {
  let storage: MemoryStorage
  let repo: LocalStorageMortgageRepository

  beforeEach(() => {
    storage = new MemoryStorage()
    repo = new LocalStorageMortgageRepository(storage, new MemoryFileStore())
  })

  it('maakt de startentiteiten aan in vaste volgorde', async () => {
    expect((await repo.listEntities()).map((e) => e.name)).toEqual([
      'K.B. Hemerik',
      'Stevig Vastgoed B.V.',
      'Basko B.V.',
    ])
  })

  it('koppelt bestaande hypotheken zonder entiteit aan de eerste entiteit', async () => {
    // Hypotheek uit een oudere versie, zonder entity_id.
    storage.setItem(
      'hypotheek-tracker:v1:mortgages',
      JSON.stringify([
        {
          id: 'oud',
          user_id: 'u',
          name: 'Oude lening',
          mortgage_number: '1',
          principal_cents: 100,
          start_date: '2024-01-01',
          end_date: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ]),
    )
    const [first] = await repo.listEntities()
    expect((await repo.listMortgages())[0]!.entityId).toBe(first!.id)
  })

  it('weigert dubbele namen (hoofdletterongevoelig)', async () => {
    await repo.listEntities()
    await expect(repo.createEntity('basko b.v.')).rejects.toThrow('al een entiteit')
    const created = await repo.createEntity('  Nieuwe Holding B.V. ')
    expect(created.name).toBe('Nieuwe Holding B.V.')
    await expect(repo.renameEntity(created.id, 'K.B. Hemerik')).rejects.toThrow('al een entiteit')
  })

  it('verwijdert een entiteit alleen zonder hypotheken', async () => {
    const [kb, stevig] = await repo.listEntities()
    await repo.createMortgage({
      entityId: kb!.id,
      name: 'A',
      mortgageNumber: '1',
      startDate: '2025-01-01',
      endDate: null,
      notes: null,
      counterpartyIban: null,
      interestMethod: 'actual',
      dueDay: null,
      parts: [
        {
          name: 'Deel 1',
          principalCents: 100_00,
          agreedRepaymentCents: 0,
          initialRateMilliPct: 3000,
        },
      ],
    })
    await expect(repo.deleteEntity(kb!.id)).rejects.toThrow('nog hypotheken')
    await repo.deleteEntity(stevig!.id)
    expect((await repo.listEntities()).map((e) => e.name)).toEqual(['K.B. Hemerik', 'Basko B.V.'])
  })

  it('weigert een hypotheek bij een onbekende entiteit', async () => {
    await expect(
      repo.createMortgage({
        entityId: 'bestaat-niet',
        name: 'A',
        mortgageNumber: '1',
        startDate: '2025-01-01',
        endDate: null,
        notes: null,
        counterpartyIban: null,
        interestMethod: 'actual',
        dueDay: null,
        parts: [
          {
            name: 'Deel 1',
            principalCents: 100_00,
            agreedRepaymentCents: 0,
            initialRateMilliPct: 3000,
          },
        ],
      }),
    ).rejects.toThrow('Entiteit niet gevonden.')
  })
})

describe('LocalStorageMortgageRepository – leningdelen en betalingsregels', () => {
  let storage: MemoryStorage
  let repo: LocalStorageMortgageRepository

  beforeEach(() => {
    storage = new MemoryStorage()
    repo = new LocalStorageMortgageRepository(storage, new MemoryFileStore())
  })

  async function twoParts() {
    const [entity] = await repo.listEntities()
    return repo.createMortgage({
      entityId: entity!.id,
      name: 'Woning',
      mortgageNumber: '1',
      startDate: '2025-01-01',
      endDate: null,
      notes: null,
      counterpartyIban: null,
      interestMethod: 'actual',
      dueDay: null,
      parts: [
        {
          name: 'A',
          principalCents: 100_000_00,
          agreedRepaymentCents: 250_00,
          initialRateMilliPct: 3000,
        },
        {
          name: 'B',
          principalCents: 50_000_00,
          agreedRepaymentCents: 0,
          initialRateMilliPct: 6000,
        },
      ],
    })
  }

  it('maakt een hypotheek met delen en per deel een startrente', async () => {
    const m = await twoParts()
    expect(m.principalCents).toBe(150_000_00)
    expect(m.parts.map((p) => [p.name, p.agreedRepaymentCents])).toEqual([
      ['A', 250_00],
      ['B', 0],
    ])
    const rates = await repo.listRates(m.id)
    expect(rates.map((r) => [r.loanPartId, r.rateMilliPct, r.effectiveDate])).toEqual([
      [m.parts[0]!.id, 3000, '2025-01-01'],
      [m.parts[1]!.id, 6000, '2025-01-01'],
    ])
  })

  it('slaat een betaling met regels op en vervangt de regels bij bewerken', async () => {
    const m = await twoParts()
    const [a, b] = m.parts
    const payment = await repo.createPayment({
      mortgageId: m.id,
      date: '2025-02-01',
      description: null,
      lines: [
        { loanPartId: a!.id, interestCents: 250_00, principalCents: 250_00 },
        { loanPartId: b!.id, interestCents: 250_00, principalCents: 0 },
        { loanPartId: b!.id, interestCents: 0, principalCents: 0 }, // lege regel wordt genegeerd
      ],
    })
    expect(payment.interestCents).toBe(500_00)
    expect(payment.lines).toHaveLength(2)

    const updated = await repo.updatePayment(payment.id, {
      mortgageId: m.id,
      date: '2025-02-02',
      description: 'Bewerkt',
      lines: [{ loanPartId: a!.id, interestCents: 1_00, principalCents: 0 }],
    })
    expect(updated.lines).toEqual([{ loanPartId: a!.id, interestCents: 1_00, principalCents: 0 }])
    expect((await repo.listPayments(m.id))[0]!.date).toBe('2025-02-02')
  })

  it('beschermt leningdelen: niet het laatste en niet met betalingen', async () => {
    const m = await twoParts()
    const [a, b] = m.parts
    await repo.createPayment({
      mortgageId: m.id,
      date: '2025-02-01',
      description: null,
      lines: [{ loanPartId: a!.id, interestCents: 1_00, principalCents: 0 }],
    })
    await expect(repo.deleteLoanPart(a!.id)).rejects.toThrow('betalingen')
    await repo.deleteLoanPart(b!.id)
    await expect(repo.deleteLoanPart(a!.id)).rejects.toThrow('minimaal één leningdeel')
    expect((await repo.listRates(m.id)).every((r) => r.loanPartId === a!.id)).toBe(true)
  })

  it('voegt een deel toe met startrente en past naam, bedrag en afspraak aan', async () => {
    const m = await twoParts()
    const c = await repo.createLoanPart({
      mortgageId: m.id,
      name: 'C',
      principalCents: 10_000_00,
      agreedRepaymentCents: 0,
      initialRateMilliPct: 5000,
    })
    expect((await repo.listRates(m.id)).find((r) => r.loanPartId === c.id)).toMatchObject({
      rateMilliPct: 5000,
      effectiveDate: '2025-01-01',
    })
    const renamed = await repo.updateLoanPart(c.id, {
      mortgageId: m.id,
      name: 'C (verhoging)',
      principalCents: 12_000_00,
      agreedRepaymentCents: 100_00,
    })
    expect(renamed).toMatchObject({
      name: 'C (verhoging)',
      principalCents: 12_000_00,
      agreedRepaymentCents: 100_00,
    })
    expect((await repo.getMortgage(m.id))!.principalCents).toBe(162_000_00)
  })

  it('weigert een betalingsregel voor een deel van een andere hypotheek', async () => {
    const m1 = await twoParts()
    const m2 = await twoParts()
    await expect(
      repo.createPayment({
        mortgageId: m1.id,
        date: '2025-02-01',
        description: null,
        lines: [{ loanPartId: m2.parts[0]!.id, interestCents: 1_00, principalCents: 0 }],
      }),
    ).rejects.toThrow('hoort niet bij deze hypotheek')
  })

  it('zet oude gegevens (hoofdsom op hypotheek, bedragen op betaling) om naar één leningdeel', async () => {
    const legacy = (key: string, rows: unknown[]) =>
      storage.setItem(`hypotheek-tracker:v1:${key}`, JSON.stringify(rows))
    const stamp = '2024-01-01T00:00:00.000Z'
    legacy('mortgages', [
      {
        id: 'm1',
        user_id: 'u',
        name: 'Oud',
        mortgage_number: '1',
        principal_cents: 200_000_00,
        start_date: '2024-01-01',
        end_date: null,
        notes: null,
        created_at: stamp,
        updated_at: stamp,
      },
    ])
    legacy('interest_rate_periods', [
      {
        id: 'r1',
        user_id: 'u',
        mortgage_id: 'm1',
        rate_percentage: '4.000',
        effective_date: '2024-01-01',
        created_at: stamp,
        updated_at: stamp,
      },
    ])
    legacy('payments', [
      {
        id: 'p1',
        user_id: 'u',
        mortgage_id: 'm1',
        payment_date: '2024-02-01',
        interest_cents: 666_67,
        principal_cents: 300_00,
        description: null,
        created_at: stamp,
        updated_at: stamp,
      },
    ])

    const [m] = await repo.listMortgages()
    expect(m!.principalCents).toBe(200_000_00)
    expect(m!.parts).toHaveLength(1)
    const partId = m!.parts[0]!.id
    expect((await repo.listRates())[0]!.loanPartId).toBe(partId)
    const [p] = await repo.listPayments()
    expect(p).toMatchObject({ interestCents: 666_67, principalCents: 300_00 })
    expect(p!.lines).toEqual([
      { loanPartId: partId, interestCents: 666_67, principalCents: 300_00 },
    ])
    // Opnieuw openen maakt geen dubbele delen of regels.
    const again = new LocalStorageMortgageRepository(storage, new MemoryFileStore())
    expect((await again.listMortgages())[0]!.parts).toHaveLength(1)
    expect((await again.listPayments())[0]!.lines).toHaveLength(1)
  })
})

describe('LocalStorageMortgageRepository – archiveren', () => {
  it('archiveert en dearchiveert een lening zonder iets te verwijderen', async () => {
    const repo = new LocalStorageMortgageRepository(new MemoryStorage(), new MemoryFileStore())
    const [entity] = await repo.listEntities()
    const m = await repo.createMortgage({
      entityId: entity!.id,
      name: 'Oud',
      mortgageNumber: '1',
      startDate: '2020-01-01',
      endDate: null,
      notes: null,
      counterpartyIban: null,
      interestMethod: 'actual',
      dueDay: null,
      parts: [
        {
          name: 'Deel 1',
          principalCents: 1_000_00,
          agreedRepaymentCents: 0,
          initialRateMilliPct: 3000,
        },
      ],
    })
    await repo.createPayment({
      mortgageId: m.id,
      date: '2020-02-01',
      description: null,
      lines: [{ loanPartId: m.parts[0]!.id, interestCents: 1_00, principalCents: 0 }],
    })
    const archived = await repo.setMortgageArchived(m.id, true)
    expect(archived.archivedAt).not.toBeNull()
    expect(await repo.listPayments(m.id)).toHaveLength(1)
    expect((await repo.setMortgageArchived(m.id, false)).archivedAt).toBeNull()
  })
})
