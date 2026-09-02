import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { loadAugmentations, saveAugmentations } from '../storage/augmentations'
import { hasCard, type Anchor, type Augmentation, type DiagramNode, type NewAugmentation, type Placement } from './types'
import { newId } from './ids'

interface State {
  items: Augmentation[]
  loaded: boolean
  selectedId: string | null
  /** A note or diagram still collecting citations. */
  draftId: string | null
  threadsOn: boolean
}

type Action =
  | { type: 'load'; items: Augmentation[] }
  | { type: 'add'; item: Augmentation }
  | { type: 'update'; id: string; updater: (item: Augmentation) => Augmentation }
  | { type: 'remove'; id: string }
  | { type: 'place'; id: string; placement: Placement }
  | { type: 'toggleFold'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'flipRewrite'; id: string }
  | { type: 'toggleCollapse'; id: string }
  | { type: 'tidy' }
  | { type: 'setDraft'; id: string | null }
  | { type: 'toggleThreads' }

const initial: State = { items: [], loaded: false, selectedId: null, draftId: null, threadsOn: true }

function patch(items: Augmentation[], id: string, updater: (item: Augmentation) => Augmentation): Augmentation[] {
  return items.map((item) => (item.id === id ? updater(item) : item))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { ...initial, items: action.items, loaded: true, threadsOn: state.threadsOn }
    case 'add':
      return { ...state, items: [...state.items, action.item], selectedId: action.item.id }
    case 'update':
      return { ...state, items: patch(state.items, action.id, action.updater) }
    case 'remove':
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        draftId: state.draftId === action.id ? null : state.draftId,
      }
    case 'place':
      return { ...state, items: patch(state.items, action.id, (i) => ({ ...i, placement: action.placement })) }
    case 'toggleFold': {
      const item = state.items.find((i) => i.id === action.id)
      if (!item) return state
      const folded = !item.folded
      return {
        ...state,
        items: patch(state.items, action.id, (i) => ({ ...i, folded })),
        selectedId: folded ? (state.selectedId === action.id ? null : state.selectedId) : action.id,
      }
    }
    case 'select':
      return { ...state, selectedId: action.id }
    case 'flipRewrite':
      return { ...state, items: patch(state.items, action.id, (i) => (i.type === 'rewrite' ? { ...i, showRewrite: !i.showRewrite } : i)) }
    case 'toggleCollapse':
      return { ...state, items: patch(state.items, action.id, (i) => (i.type === 'fold' ? { ...i, collapsed: !i.collapsed } : i)) }
    case 'tidy':
      return { ...state, items: state.items.map((i) => (i.placement ? { ...i, placement: undefined } : i)) }
    case 'setDraft':
      return { ...state, draftId: action.id }
    case 'toggleThreads':
      return { ...state, threadsOn: !state.threadsOn }
  }
}

export interface AugmentationsApi extends State {
  add: (item: NewAugmentation) => Augmentation
  update: (id: string, updater: (item: Augmentation) => Augmentation) => void
  remove: (id: string) => void
  place: (id: string, placement: Placement) => void
  toggleFold: (id: string) => void
  select: (id: string | null) => void
  flipRewrite: (id: string) => void
  toggleCollapse: (id: string) => void
  tidy: () => void
  setDraft: (id: string | null) => void
  toggleThreads: () => void
  /** Adds a citation to the active draft: an anchor for a note, a chained node for a diagram. */
  cite: (anchor: Anchor) => boolean
  byId: (id: string) => Augmentation | undefined
  shownCount: number
  inTextCount: number
}

const Context = createContext<AugmentationsApi | null>(null)

const SAVE_DELAY = 300

export function AugmentationsProvider({ fingerprint, children }: { fingerprint: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => {
    let cancelled = false
    loadAugmentations(fingerprint)
      .then((items) => {
        if (!cancelled) dispatch({ type: 'load', items })
      })
      .catch((err: unknown) => {
        console.error('could not load augmentations', err)
        if (!cancelled) dispatch({ type: 'load', items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [fingerprint])

  useEffect(() => {
    if (!state.loaded) return
    const handle = setTimeout(() => {
      saveAugmentations(fingerprint, state.items).catch((err: unknown) => console.error('could not save augmentations', err))
    }, SAVE_DELAY)
    return () => clearTimeout(handle)
  }, [fingerprint, state.items, state.loaded])

  const add = useCallback<AugmentationsApi['add']>((partial) => {
    const item = { id: newId(), createdAt: Date.now(), folded: false, ...partial } as Augmentation
    dispatch({ type: 'add', item })
    return item
  }, [])

  const { draftId, items } = state
  const cite = useCallback((anchor: Anchor): boolean => {
    const draft = draftId ? items.find((i) => i.id === draftId) : undefined
    if (!draft) return false
    if (draft.type === 'note') {
      dispatch({ type: 'update', id: draft.id, updater: (i) => (i.type === 'note' ? { ...i, anchors: [...i.anchors, anchor] } : i) })
      return true
    }
    if (draft.type === 'diagram') {
      const node: DiagramNode = { id: newId('node'), label: anchor.text.slice(0, 60), anchor }
      dispatch({
        type: 'update',
        id: draft.id,
        updater: (i) => {
          if (i.type !== 'diagram') return i
          const last = i.nodes[i.nodes.length - 1]
          return { ...i, nodes: [...i.nodes, node], edges: last ? [...i.edges, { from: last.id, to: node.id }] : i.edges }
        },
      })
      return true
    }
    return false
  }, [draftId, items])

  const api = useMemo<AugmentationsApi>(() => {
    const cards = state.items.filter(hasCard)
    return {
      ...state,
      add,
      cite,
      update: (id, updater) => dispatch({ type: 'update', id, updater }),
      remove: (id) => dispatch({ type: 'remove', id }),
      place: (id, placement) => dispatch({ type: 'place', id, placement }),
      toggleFold: (id) => dispatch({ type: 'toggleFold', id }),
      select: (id) => dispatch({ type: 'select', id }),
      flipRewrite: (id) => dispatch({ type: 'flipRewrite', id }),
      toggleCollapse: (id) => dispatch({ type: 'toggleCollapse', id }),
      tidy: () => dispatch({ type: 'tidy' }),
      setDraft: (id) => dispatch({ type: 'setDraft', id }),
      toggleThreads: () => dispatch({ type: 'toggleThreads' }),
      byId: (id) => state.items.find((i) => i.id === id),
      shownCount: cards.filter((c) => !c.folded).length,
      inTextCount: cards.filter((c) => c.folded).length,
    }
  }, [state, add, cite])

  return <Context.Provider value={api}>{children}</Context.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAugmentations(): AugmentationsApi {
  const api = useContext(Context)
  if (!api) throw new Error('useAugmentations must be used inside AugmentationsProvider')
  return api
}
