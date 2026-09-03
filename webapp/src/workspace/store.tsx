import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { newId } from './ids'
import { withCitations, withoutCitation } from './linking'
import { insertIndex } from './position'
import { loadWorkspaceDoc, saveWorkspaceDoc } from './storage'
import type { Block, BlockContent, Citation, Highlight, Position, ViewerTarget, WorkspaceDoc } from './types'

/** The part of the state that undo/redo travels through. */
interface Snapshot {
  title: string
  blocks: Block[]
  highlights: Highlight[]
}

interface State extends Snapshot {
  loaded: boolean
  quizAnswers: Record<string, number>
  revealed: Record<string, boolean>
  selectedBlockId: string | null
  /** Passages gathered from the sources, waiting to become a block or to be linked to one. */
  collecting: boolean
  collected: Citation[]
  /** When collecting was started from a block, the passages are meant for it. */
  collectTarget: string | null
  /** Timestamp of the last focus_block, so the document can scroll to and flash the selection. */
  focusKey: number
  viewer: ViewerTarget | null
  past: Snapshot[]
  future: Snapshot[]
}

type Action =
  | { type: 'load'; doc: WorkspaceDoc | null }
  | { type: 'setTitle'; title: string }
  | { type: 'replace'; doc: WorkspaceDoc }
  | { type: 'reset' }
  | { type: 'addBlock'; block: Block; position: Position }
  | { type: 'updateBlock'; id: string; updater: (block: Block) => Block }
  | { type: 'removeBlocks'; ids: string[] }
  | { type: 'moveBlock'; id: string; position: Position }
  | { type: 'addHighlight'; highlight: Highlight }
  | { type: 'removeHighlight'; id: string }
  | { type: 'answerQuiz'; questionId: string; option: number }
  | { type: 'reveal'; cardId: string; revealed: boolean }
  | { type: 'select'; id: string | null }
  | { type: 'startCollecting'; target: string | null }
  | { type: 'stopCollecting' }
  | { type: 'collect'; citation: Citation }
  | { type: 'uncollect'; index: number }
  | { type: 'focus'; id: string }
  | { type: 'openViewer'; target: Omit<ViewerTarget, 'key'> }
  | { type: 'closeViewer' }
  | { type: 'undo' }
  | { type: 'redo' }

const initial: State = {
  title: 'Untitled space',
  blocks: [],
  highlights: [],
  loaded: false,
  quizAnswers: {},
  revealed: {},
  selectedBlockId: null,
  collecting: false,
  collected: [],
  collectTarget: null,
  focusKey: 0,
  viewer: null,
  past: [],
  future: [],
}

const HISTORY_LIMIT = 100
const VIEW_ACTIONS = new Set<Action['type']>(['load', 'reset', 'answerQuiz', 'reveal', 'select', 'startCollecting', 'stopCollecting', 'collect', 'uncollect', 'focus', 'openViewer', 'closeViewer', 'undo', 'redo'])

const snapshot = (s: State): Snapshot => ({ title: s.title, blocks: s.blocks, highlights: s.highlights })

function restore(state: State, snap: Snapshot): State {
  const has = (id: string | null) => id !== null && snap.blocks.some((b) => b.id === id)
  return { ...state, ...snap, selectedBlockId: has(state.selectedBlockId) ? state.selectedBlockId : null, collectTarget: has(state.collectTarget) ? state.collectTarget : null }
}

function reducer(state: State, action: Action): State {
  const next = apply(state, action)
  if (VIEW_ACTIONS.has(action.type)) return next
  if (next.blocks === state.blocks && next.highlights === state.highlights && next.title === state.title) return next
  return { ...next, past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshot(state)], future: [] }
}

function apply(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { ...initial, loaded: true, ...(action.doc ? { title: action.doc.title, blocks: action.doc.blocks, highlights: action.doc.highlights, quizAnswers: action.doc.quizAnswers ?? {} } : {}) }
    case 'setTitle':
      return { ...state, title: action.title }
    case 'reset':
      return { ...initial, loaded: true }
    case 'replace':
      return { ...state, title: action.doc.title, blocks: action.doc.blocks, highlights: action.doc.highlights, quizAnswers: action.doc.quizAnswers ?? {}, revealed: {}, selectedBlockId: null, collecting: false, collected: [], collectTarget: null, viewer: null }
    case 'addBlock': {
      const at = insertIndex(state.blocks, action.position)
      if (typeof at !== 'number') return state
      const blocks = [...state.blocks]
      blocks.splice(at, 0, action.block)
      return { ...state, blocks, selectedBlockId: action.block.id }
    }
    case 'updateBlock':
      return { ...state, blocks: state.blocks.map((b) => (b.id === action.id ? { ...action.updater(b), updatedAt: Date.now() } : b)) }
    case 'removeBlocks': {
      const gone = new Set(action.ids)
      return {
        ...state,
        blocks: state.blocks.filter((b) => !gone.has(b.id)),
        selectedBlockId: state.selectedBlockId && gone.has(state.selectedBlockId) ? null : state.selectedBlockId,
        collectTarget: state.collectTarget && gone.has(state.collectTarget) ? null : state.collectTarget,
      }
    }
    case 'moveBlock': {
      const block = state.blocks.find((b) => b.id === action.id)
      if (!block) return state
      const at = insertIndex(state.blocks, action.position, action.id)
      if (typeof at !== 'number') return state
      const blocks = state.blocks.filter((b) => b.id !== action.id)
      blocks.splice(at, 0, block)
      return { ...state, blocks }
    }
    case 'addHighlight':
      return { ...state, highlights: [...state.highlights, action.highlight] }
    case 'removeHighlight':
      return { ...state, highlights: state.highlights.filter((h) => h.id !== action.id) }
    case 'answerQuiz':
      return { ...state, quizAnswers: { ...state.quizAnswers, [action.questionId]: action.option } }
    case 'reveal':
      return { ...state, revealed: { ...state.revealed, [action.cardId]: action.revealed } }
    case 'select':
      return { ...state, selectedBlockId: action.id }
    case 'startCollecting':
      return { ...state, collecting: true, collectTarget: action.target }
    case 'stopCollecting':
      return { ...state, collecting: false, collected: [], collectTarget: null }
    case 'collect':
      return { ...state, collecting: true, collected: [...state.collected, action.citation] }
    case 'uncollect':
      return { ...state, collected: state.collected.filter((_, i) => i !== action.index) }
    case 'focus':
      return { ...state, selectedBlockId: action.id, focusKey: Date.now() }
    case 'openViewer':
      return { ...state, viewer: { ...action.target, key: Date.now() } }
    case 'closeViewer':
      return { ...state, viewer: null }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return { ...restore(state, previous), past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] }
    }
    case 'redo': {
      const [nextSnap, ...rest] = state.future
      if (!nextSnap) return state
      return { ...restore(state, nextSnap), past: [...state.past, snapshot(state)], future: rest }
    }
  }
}

export interface NewBlock {
  content: BlockContent
  citations?: Citation[]
  note?: string
  by?: 'user' | 'agent'
}

export interface WorkspaceApi extends State {
  setTitle: (title: string) => void
  /** Swaps the whole document (import); one undo step. */
  replaceDoc: (doc: WorkspaceDoc) => void
  /** Back to an empty space; clears the history too. */
  reset: () => void
  addBlock: (block: NewBlock, position?: Position) => Block
  updateBlock: (id: string, updater: (block: Block) => Block) => void
  removeBlocks: (ids: string[]) => void
  moveBlock: (id: string, position: Position) => void
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => Highlight
  removeHighlight: (id: string) => void
  answerQuiz: (questionId: string, option: number) => void
  reveal: (cardId: string, revealed: boolean) => void
  select: (id: string | null) => void
  /** Gathering passages: start (optionally for a block), add one, drop one, stop and clear. */
  startCollecting: (target?: string | null) => void
  stopCollecting: () => void
  collect: (citation: Citation) => void
  uncollect: (index: number) => void
  /** Appends citations to a block; a paragraph gets [n] marks unless `silent`. */
  linkSources: (id: string, citations: Citation[], silent?: boolean) => void
  unlinkSource: (id: string, index: number) => void
  /** Selects a block and asks the document to scroll to it. */
  focusBlock: (id: string) => void
  openViewer: (target: Omit<ViewerTarget, 'key'>) => void
  closeViewer: () => void
  undo: () => boolean
  redo: () => boolean
  blockById: (id: string) => Block | undefined
  /** The state as of the last dispatch, ahead of React's render, for tools that chain calls. */
  getState: () => State
}

const Context = createContext<WorkspaceApi | null>(null)
const SAVE_DELAY = 300

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, reactDispatch] = useReducer(reducer, initial)
  const latest = useRef(state)
  const dispatch = useCallback((action: Action) => {
    latest.current = reducer(latest.current, action)
    reactDispatch(action)
  }, [])
  useEffect(() => {
    latest.current = state
  }, [state])

  useEffect(() => {
    let cancelled = false
    loadWorkspaceDoc()
      .then((doc) => {
        if (!cancelled) dispatch({ type: 'load', doc })
      })
      .catch((err: unknown) => {
        console.error('could not load workspace', err)
        if (!cancelled) dispatch({ type: 'load', doc: null })
      })
    return () => {
      cancelled = true
    }
  }, [dispatch])

  const { loaded, title, blocks, highlights, quizAnswers } = state
  useEffect(() => {
    if (!loaded) return
    const handle = setTimeout(() => {
      saveWorkspaceDoc({ title, blocks, highlights, quizAnswers }).catch((err: unknown) => console.error('could not save workspace', err))
    }, SAVE_DELAY)
    return () => clearTimeout(handle)
  }, [loaded, title, blocks, highlights, quizAnswers])

  const api = useMemo<WorkspaceApi>(
    () => ({
      ...state,
      setTitle: (t) => dispatch({ type: 'setTitle', title: t }),
      replaceDoc: (doc) => dispatch({ type: 'replace', doc }),
      reset: () => dispatch({ type: 'reset' }),
      addBlock: (partial, position = 'end') => {
        const now = Date.now()
        const block: Block = { id: newId('b'), content: partial.content, citations: partial.citations ?? [], by: partial.by ?? 'user', createdAt: now, updatedAt: now, ...(partial.note ? { note: partial.note } : {}) }
        dispatch({ type: 'addBlock', block, position })
        return block
      },
      updateBlock: (id, updater) => dispatch({ type: 'updateBlock', id, updater }),
      removeBlocks: (ids) => dispatch({ type: 'removeBlocks', ids }),
      moveBlock: (id, position) => dispatch({ type: 'moveBlock', id, position }),
      addHighlight: (partial) => {
        const highlight: Highlight = { id: newId('h'), createdAt: Date.now(), ...partial }
        dispatch({ type: 'addHighlight', highlight })
        return highlight
      },
      removeHighlight: (id) => dispatch({ type: 'removeHighlight', id }),
      answerQuiz: (questionId, option) => dispatch({ type: 'answerQuiz', questionId, option }),
      reveal: (cardId, revealed) => dispatch({ type: 'reveal', cardId, revealed }),
      select: (id) => dispatch({ type: 'select', id }),
      startCollecting: (target = null) => dispatch({ type: 'startCollecting', target }),
      stopCollecting: () => dispatch({ type: 'stopCollecting' }),
      collect: (citation) => dispatch({ type: 'collect', citation }),
      uncollect: (index) => dispatch({ type: 'uncollect', index }),
      linkSources: (id, citations, silent = false) => dispatch({ type: 'updateBlock', id, updater: (b) => withCitations(b, citations, silent) }),
      unlinkSource: (id, index) => dispatch({ type: 'updateBlock', id, updater: (b) => withoutCitation(b, index) }),
      focusBlock: (id) => dispatch({ type: 'focus', id }),
      openViewer: (target) => dispatch({ type: 'openViewer', target }),
      closeViewer: () => dispatch({ type: 'closeViewer' }),
      undo: () => {
        if (latest.current.past.length === 0) return false
        dispatch({ type: 'undo' })
        return true
      },
      redo: () => {
        if (latest.current.future.length === 0) return false
        dispatch({ type: 'redo' })
        return true
      },
      blockById: (id) => latest.current.blocks.find((b) => b.id === id),
      getState: () => latest.current,
    }),
    [state, dispatch],
  )

  return <Context.Provider value={api}>{children}</Context.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useWorkspace(): WorkspaceApi {
  const api = useContext(Context)
  if (!api) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return api
}
