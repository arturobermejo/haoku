import { createContext, useContext } from 'react'
import type { Band } from '../augment/bands'
import type { Anchor } from '../augment/types'
import type { PageDims } from '../pdf/types'

/** A sheet's box in workspace-inner pixels. */
export interface SheetFrame {
  left: number
  top: number
  width: number
  height: number
}

export interface Halo {
  x: number
  y: number
  key: number
}

export interface WorkspaceApi {
  scale: number
  frames: ReadonlyMap<number, SheetFrame>
  bandsByPage: ReadonlyMap<number, Band[]>
  pageDims: (page: number) => PageDims
  /** Scale-1 page coordinates → workspace-inner pixels, through the page's bands. */
  pageToInner: (page: number, x: number, y: number) => { x: number; y: number }
  innerToPage: (page: number, x: number, y: number) => { x: number; y: number }
  /** Scrolls the anchor into the middle of the view and flashes a halo on it. */
  jumpTo: (anchor: Anchor) => void
  halo: Halo | null
  /** A rewrite panel reports its rendered height so the page can reflow around it. */
  reportRewriteHeight: (id: string, px: number | null) => void
}

export const WorkspaceContext = createContext<WorkspaceApi | null>(null)

export function useWorkspace(): WorkspaceApi {
  const api = useContext(WorkspaceContext)
  if (!api) throw new Error('useWorkspace must be used inside Workspace')
  return api
}
