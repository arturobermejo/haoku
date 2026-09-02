/** Keeps the last opened PDF so a reload does not lose it. */
import { run, STORES } from './db'

const KEY = 'last'

export interface StoredDocument {
  name: string
  blob: Blob
  openedAt: number
}

export function saveLastDocument(blob: Blob, name: string): Promise<void> {
  const doc: StoredDocument = { name, blob, openedAt: Date.now() }
  return run(STORES.documents, 'readwrite', (store) => store.put(doc, KEY)).then(() => undefined)
}

export function loadLastDocument(): Promise<StoredDocument | null> {
  return run<StoredDocument | undefined>(STORES.documents, 'readonly', (store) => store.get(KEY)).then((doc) => doc ?? null)
}

export function clearLastDocument(): Promise<void> {
  return run(STORES.documents, 'readwrite', (store) => store.delete(KEY)).then(() => undefined)
}
