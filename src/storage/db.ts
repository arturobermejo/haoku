/** The one IndexedDB database Haoku keeps; every store lives here. */

const DB_NAME = 'haoku'
/** The database name from before the product was renamed; its contents are adopted once, then it is deleted. */
const OLD_DB_NAME = 'saoku'
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

let adopting: Promise<void> | null = null

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    let created = false
    request.onupgradeneeded = (event) => {
      const db = request.result
      created = event.oldVersion === 0
      for (const name of LEGACY_STORES) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name)
      }
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }
    request.onsuccess = () => {
      const db = request.result
      if (created && !adopting) adopting = adoptOldDatabase(db).catch(() => undefined)
      void (adopting ?? Promise.resolve()).then(() => resolve(db))
    }
    request.onerror = () => reject(request.error)
  })
}

/** Copies the sources and workspace saved under the old product name into the new database, once, then drops the old one. */
async function adoptOldDatabase(db: IDBDatabase): Promise<void> {
  if (typeof indexedDB.databases !== 'function') return
  const names = (await indexedDB.databases()).map((d) => d.name)
  if (!names.includes(OLD_DB_NAME)) return
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OLD_DB_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  for (const name of Object.values(STORES)) {
    if (!old.objectStoreNames.contains(name)) continue
    const rows = await new Promise<{ key: IDBValidKey; value: unknown }[]>((resolve, reject) => {
      const out: { key: IDBValidKey; value: unknown }[] = []
      const request = old.transaction(name, 'readonly').objectStore(name).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return resolve(out)
        out.push({ key: cursor.key, value: cursor.value })
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
    if (rows.length === 0) continue
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite')
      const store = tx.objectStore(name)
      for (const row of rows) store.put(row.value, row.key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  old.close()
  indexedDB.deleteDatabase(OLD_DB_NAME)
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
