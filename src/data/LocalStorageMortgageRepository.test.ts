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
    return repo.createMortgage({
      name: 'Test',
      mortgageNumber: '1',
      principalCents: 100_000_00,
      startDate: '2025-01-01',
      endDate: null,
      notes: null,
      initialRateMilliPct: 3000,
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
