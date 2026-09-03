import { run, STORES } from '../storage/db'
import type { Source, WorkspaceDoc } from './types'

interface StoredSource {
  meta: Source
  blob: Blob
}

const WORKSPACE_KEY = 'main'

export function listStoredSources(): Promise<StoredSource[]> {
  return run<StoredSource[]>(STORES.sources, 'readonly', (store) => store.getAll())
}

export function putStoredSource(meta: Source, blob: Blob): Promise<void> {
  return run(STORES.sources, 'readwrite', (store) => store.put({ meta, blob } satisfies StoredSource, meta.id)).then(() => undefined)
}

export function deleteStoredSource(id: string): Promise<void> {
  return run(STORES.sources, 'readwrite', (store) => store.delete(id)).then(() => undefined)
}

export function loadWorkspaceDoc(): Promise<WorkspaceDoc | null> {
  return run<WorkspaceDoc | undefined>(STORES.workspace, 'readonly', (store) => store.get(WORKSPACE_KEY)).then((doc) => doc ?? null)
}

export function saveWorkspaceDoc(doc: WorkspaceDoc): Promise<void> {
  return run(STORES.workspace, 'readwrite', (store) => store.put(doc, WORKSPACE_KEY)).then(() => undefined)
}
