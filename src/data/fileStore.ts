import { RepositoryError } from './MortgageRepository'

/**
 * Opslag voor bestandsinhoud (blobs), los van de metadata. Lokaal is dat IndexedDB:
 * localStorage is te klein (~5 MB) en kan alleen tekst bewaren.
 */
export interface FileStore {
  put(key: string, blob: Blob): Promise<void>
  get(key: string): Promise<Blob | null>
  delete(key: string): Promise<void>
}

const DB_NAME = 'hypotheek-tracker'
const STORE = 'document-files'

export class IndexedDbFileStore implements FileStore {
  private db: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(
          new RepositoryError('Bestandsopslag (IndexedDB) is niet beschikbaar.', request.error),
        )
    })
    return this.db
  }

  private async run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = tx.onabort = () => {
        const error = tx.error ?? request.error
        reject(
          new RepositoryError(
            error?.name === 'QuotaExceededError'
              ? 'Onvoldoende opslagruimte in de browser voor dit bestand.'
              : 'Bestand kon niet worden opgeslagen of gelezen.',
            error,
          ),
        )
      }
    })
  }

  async put(key: string, blob: Blob) {
    await this.run('readwrite', (s) => s.put(blob, key))
  }

  async get(key: string) {
    const result = await this.run<Blob | undefined>('readonly', (s) => s.get(key))
    return result ?? null
  }

  async delete(key: string) {
    await this.run('readwrite', (s) => s.delete(key))
  }
}

/** Voor tests en omgevingen zonder IndexedDB. */
export class MemoryFileStore implements FileStore {
  readonly files = new Map<string, Blob>()
  async put(key: string, blob: Blob) {
    this.files.set(key, blob)
  }
  async get(key: string) {
    return this.files.get(key) ?? null
  }
  async delete(key: string) {
    this.files.delete(key)
  }
}
