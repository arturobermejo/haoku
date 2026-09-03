/** The one IndexedDB database saoku keeps; every store lives here. */

const DB_NAME = 'saoku'
const DB_VERSION = 3

export const STORES = {
  /** id → { meta: Source, blob: Blob } */
  sources: 'sources',
  /** 'main' → WorkspaceDoc */
  workspace: 'workspace',
} as const

/** Stores from earlier versions of the product, dropped on upgrade. */
const LEGACY_STORES = ['documents', 'augmentations']

type StoreName = (typeof STORES)[keyof typeof STORES]

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of LEGACY_STORES) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name)
      }
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function run<T>(store: StoreName, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = op(tx.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      }),
  )
}
