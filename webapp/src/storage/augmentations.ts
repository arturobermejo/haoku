/** Augmentations persist per document, keyed by the PDF's fingerprint. */
import type { Augmentation } from '../augment/types'
import { run, STORES } from './db'

export function loadAugmentations(fingerprint: string): Promise<Augmentation[]> {
  return run<Augmentation[] | undefined>(STORES.augmentations, 'readonly', (store) => store.get(fingerprint)).then((items) => items ?? [])
}

export function saveAugmentations(fingerprint: string, items: Augmentation[]): Promise<void> {
  return run(STORES.augmentations, 'readwrite', (store) => store.put(items, fingerprint)).then(() => undefined)
}
