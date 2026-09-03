import { createContext, useContext } from 'react'
import type { PageDims } from '../pdf/types'
import type { Anchor } from '../tools/textIndex'
import type { Highlight } from '../workspace/types'

export interface Halo {
  x: number
  y: number
  key: number
}

export interface ReaderApi {
  scale: number
  currentPage: number
  pageDims: (page: number) => PageDims
  /** Persistent washes on this source. */
  highlights: Highlight[]
  /** The passage the viewer was opened on, once resolved. */
  active: Anchor | null
  /** Scrolls the anchor into the middle of the view and flashes a halo on it. */
  jumpTo: (anchor: Anchor) => void
  scrollToPage: (page: number) => void
  halo: Halo | null
}

export const ReaderContext = createContext<ReaderApi | null>(null)

export function useReader(): ReaderApi {
  const api = useContext(ReaderContext)
  if (!api) throw new Error('useReader must be used inside PdfReader')
  return api
}
