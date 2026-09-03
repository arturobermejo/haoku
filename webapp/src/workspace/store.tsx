import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { newId } from './ids'
import { blockToMarkdown, citationKeysIn, isLegacyDoc, migrateLegacy, nextKey, parseDocument, reconcileIds, sameCitation, serializeDocument, withCiteMarks, withoutCiteMark, type BlockData, type ParsedBlock } from './markdown'
import { insertIndex } from './position'
import { useSources } from './sources'
import { loadWorkspaceDoc, saveWorkspaceDoc } from './storage'
import type { BlockMeta, Citation, Highlight, Position, ViewerTarget, WorkspaceDoc } from './types'

/**
 * The document is a Markdown string; `blocks` and `footnotes` are derived from it (and kept in the
 * snapshot so undo restores the same ids). Every document change goes through `document`, which the
 * API layer prepares with the pure markdown helpers.
 */
interface Snapshot {
  title: string
  markdown: string
  highlights: Highlight[]
  blocks: ParsedBlock[]
  footnotes: Map<string, Citation>
}

interface State extends Snapshot {
  loaded: boolean
  quizAnswers: Record<string, number>
  revealed: Record<string, boolean>
  blockMeta: Record<string, BlockMeta>
  rawView: boolean
  selectedBlockId: string | null
  collecting: boolean
  collected: Citation[]
  collectTarget: string | null
  focusKey: number
  viewer: ViewerTarget | null
  past: Snapshot[]
  future: Snapshot[]
}

interface DocumentChange {
  markdown: string
  blocks: ParsedBlock[]
  footnotes: Map<string, Citation>
  meta?: Record<string, BlockMeta>
  select?: string | null
  /** Quiz answers / reveals to forget (block ids whose questions changed). */
  forget?: string[]
}

type Action =
  | { type: 'load'; doc: WorkspaceDoc | null }
  | { type: 'replace'; doc: WorkspaceDoc }
  | { type: 'reset' }
  | { type: 'setTitle'; title: string }
  | ({ type: 'document' } & DocumentChange)
  | { type: 'addHighlight'; highlight: Highlight }
  | { type: 'removeHighlight'; id: string }
  | { type: 'answerQuiz'; key: string; option: number }
  | { type: 'reveal'; key: string; revealed: boolean }
  | { type: 'setRawView'; on: boolean }
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
  markdown: '',
  highlights: [],
  blocks: [],
  footnotes: new Map(),
  loaded: false,
  quizAnswers: {},
  revealed: {},
  blockMeta: {},
  rawView: false,
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
const VIEW_ACTIONS = new Set<Action['type']>(['load', 'reset', 'answerQuiz', 'reveal', 'setRawView', 'select', 'startCollecting', 'stopCollecting', 'collect', 'uncollect', 'focus', 'openViewer', 'closeViewer', 'undo', 'redo'])

const snapshot = (s: State): Snapshot => ({ title: s.title, markdown: s.markdown, highlights: s.highlights, blocks: s.blocks, footnotes: s.footnotes })

function fromDoc(doc: WorkspaceDoc): Pick<State, 'title' | 'markdown' | 'highlights' | 'blocks' | 'footnotes' | 'quizAnswers' | 'blockMeta'> {
  const parsed = parseDocument(doc.markdown, { ids: doc.blockIds })
  return { title: doc.title, markdown: doc.markdown, highlights: doc.highlights ?? [], blocks: parsed.blocks, footnotes: parsed.footnotes, quizAnswers: doc.quizAnswers ?? {}, blockMeta: doc.blockMeta ?? {} }
}

function restore(state: State, snap: Snapshot): State {
  const ids = new Set(snap.blocks.map((b) => b.id))
  return { ...state, ...snap, selectedBlockId: state.selectedBlockId && ids.has(state.selectedBlockId) ? state.selectedBlockId : null, collectTarget: state.collectTarget && ids.has(state.collectTarget) ? state.collectTarget : null }
}

function reducer(state: State, action: Action): State {
  const next = apply(state, action)
  if (VIEW_ACTIONS.has(action.type)) return next
  if (next.markdown === state.markdown && next.highlights === state.highlights && next.title === state.title) return next
  return { ...next, past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshot(state)], future: [] }
}

function apply(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { ...initial, loaded: true, ...(action.doc ? fromDoc(action.doc) : {}) }
    case 'replace':
      return { ...state, ...fromDoc(action.doc), revealed: {}, selectedBlockId: null, collecting: false, collected: [], collectTarget: null, viewer: null, rawView: false }
    case 'reset':
      return { ...initial, loaded: true }
    case 'setTitle':
      return { ...state, title: action.title }
    case 'document': {
      const forget = new Set(action.forget ?? [])
      const drop = (record: Record<string, number> | Record<string, boolean>) => Object.fromEntries(Object.entries(record).filter(([k]) => !forget.has(k.split(':')[0])))
      return {
        ...state,
        markdown: action.markdown,
        blocks: action.blocks,
        footnotes: action.footnotes,
        blockMeta: action.meta ? { ...state.blockMeta, ...action.meta } : state.blockMeta,
        quizAnswers: forget.size ? (drop(state.quizAnswers) as Record<string, number>) : state.quizAnswers,
        revealed: forget.size ? (drop(state.revealed) as Record<string, boolean>) : state.revealed,
        selectedBlockId: action.select !== undefined ? action.select : state.selectedBlockId && action.blocks.some((b) => b.id === state.selectedBlockId) ? state.selectedBlockId : null,
        collectTarget: state.collectTarget && action.blocks.some((b) => b.id === state.collectTarget) ? state.collectTarget : null,
      }
    }
    case 'addHighlight':
      return { ...state, highlights: [...state.highlights, action.highlight] }
    case 'removeHighlight':
      return { ...state, highlights: state.highlights.filter((h) => h.id !== action.id) }
    case 'answerQuiz':
      return { ...state, quizAnswers: { ...state.quizAnswers, [action.key]: action.option } }
    case 'reveal':
      return { ...state, revealed: { ...state.revealed, [action.key]: action.revealed } }
    case 'setRawView':
      return { ...state, rawView: action.on }
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

/** Builds a block's markdown once its citations have footnote keys. */
export type RawBuilder = string | ((keys: string[]) => string)

export interface WorkspaceApi extends State {
  setTitle: (title: string) => void
  /** Swaps the whole document (import); one undo step. */
  replaceDoc: (doc: WorkspaceDoc) => void
  /** Back to an empty space; clears the history too. */
  reset: () => void
  /** Replaces the whole markdown (raw editor); ids are reconciled. */
  setMarkdown: (markdown: string) => void
  /**
   * Inserts markdown at a position. Citations get footnote keys first (deduplicated) and are handed to
   * `raw` when it is a builder. Returns the block(s) the markdown parsed into.
   */
  insertBlock: (raw: RawBuilder, position?: Position, citations?: Citation[], by?: 'user' | 'agent') => ParsedBlock[]
  /** Replaces one block's markdown; the id stays unless the text parses into several blocks. */
  replaceBlock: (id: string, raw: RawBuilder, citations?: Citation[]) => void
  updateBlockData: (id: string, data: BlockData) => void
  removeBlocks: (ids: string[]) => void
  moveBlock: (id: string, position: Position) => void
  /** Footnote keys for citations, adding definitions when new. */
  addCitations: (citations: Citation[]) => string[]
  /** Adds citation marks to a block (text marks or `cites` attribute by kind). */
  linkSources: (id: string, citations: Citation[]) => string[]
  unlinkSource: (id: string, key: string) => void
  addHighlight: (highlight: Omit<Highlight, 'id' | 'createdAt'>) => Highlight
  removeHighlight: (id: string) => void
  answerQuiz: (blockId: string, questionIndex: number, option: number) => void
  reveal: (blockId: string, cardIndex: number, revealed: boolean) => void
  setRawView: (on: boolean) => void
  select: (id: string | null) => void
  startCollecting: (target?: string | null) => void
  stopCollecting: () => void
  collect: (citation: Citation) => void
  uncollect: (index: number) => void
  focusBlock: (id: string) => void
  openViewer: (target: Omit<ViewerTarget, 'key'>) => void
  closeViewer: () => void
  undo: () => boolean
  redo: () => boolean
  blockById: (id: string) => ParsedBlock | undefined
  /** The citations a block draws on, in mark order. */
  citationsOf: (block: ParsedBlock) => Citation[]
  /** The state as of the last dispatch, ahead of React's render, for tools that chain calls. */
  getState: () => State
}

const Context = createContext<WorkspaceApi | null>(null)
const SAVE_DELAY = 300

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, reactDispatch] = useReducer(reducer, initial)
  const latest = useRef(state)
  const sources = useSources()
  const sourceName = useCallback((id: string) => sources.byId(id)?.name ?? id, [sources])
  const dispatch = useCallback((action: Action) => {
    latest.current = reducer(latest.current, action)
    reactDispatch(action)
  }, [])
  useEffect(() => {
    latest.current = state
  }, [state])

  useEffect(() => {
    if (!sources.loaded) return
    let cancelled = false
    loadWorkspaceDoc()
      .then((doc) => {
        if (cancelled) return
        dispatch({ type: 'load', doc: doc ? (isLegacyDoc(doc) ? migrateLegacy(doc, sourceName) : doc) : null })
      })
      .catch((err: unknown) => {
        console.error('could not load workspace', err)
        if (!cancelled) dispatch({ type: 'load', doc: null })
      })
    return () => {
      cancelled = true
    }
  }, [dispatch, sources.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const { loaded, title, markdown, highlights, quizAnswers, blocks, blockMeta } = state
  useEffect(() => {
    if (!loaded) return
    const handle = setTimeout(() => {
      const doc: WorkspaceDoc = { version: 2, title, markdown, highlights, quizAnswers, blockIds: blocks.map((b) => b.id), blockMeta }
      saveWorkspaceDoc(doc).catch((err: unknown) => console.error('could not save workspace', err))
    }, SAVE_DELAY)
    return () => clearTimeout(handle)
  }, [loaded, title, markdown, highlights, quizAnswers, blocks, blockMeta])

  const api = useMemo<WorkspaceApi>(() => {
    // ---- pure helpers over the latest state ----
    const keysFor = (footnotes: Map<string, Citation>, citations: Citation[]): { keys: string[]; footnotes: Map<string, Citation> } => {
      const next = new Map(footnotes)
      const keys = citations.map((c) => {
        for (const [k, v] of next) if (sameCitation(v, c)) return k
        const k = nextKey(next)
        next.set(k, c)
        return k
      })
      return { keys, footnotes: next }
    }
    const commit = (blocks: ParsedBlock[], footnotes: Map<string, Citation>, extra: Partial<DocumentChange> = {}) => {
      const md = serializeDocument(blocks, footnotes, { sourceName })
      // Footnotes nobody references any more are dropped from the text; keep the map in step.
      const parsed = parseDocument(md, { ids: blocks.map((b) => b.id) })
      dispatch({ type: 'document', markdown: md, blocks: parsed.blocks, footnotes: parsed.footnotes, ...extra })
      return parsed.blocks
    }
    /** Parses one raw chunk into blocks; the first keeps `id`. */
    const chunk = (raw: string, id?: string): ParsedBlock[] => {
      const parsed = parseDocument(raw).blocks
      if (parsed.length === 0) return []
      return id ? [{ ...parsed[0], id }, ...parsed.slice(1)] : parsed
    }
    const build = (raw: RawBuilder, keys: string[]) => (typeof raw === 'function' ? raw(keys) : raw)

    const insertBlock: WorkspaceApi['insertBlock'] = (raw, position = 'end', citations = [], by = 'user') => {
      const s = latest.current
      const at = insertIndex(s.blocks, position)
      if (typeof at !== 'number') return []
      const { keys, footnotes } = keysFor(s.footnotes, citations)
      const fresh = chunk(build(raw, keys))
      if (fresh.length === 0) return []
      const blocks = [...s.blocks]
      blocks.splice(at, 0, ...fresh)
      const now = Date.now()
      const meta = Object.fromEntries(fresh.map((b) => [b.id, { by, createdAt: now }]))
      const committed = commit(blocks, footnotes, { meta, select: fresh[0].id })
      return committed.slice(at, at + fresh.length)
    }

    const replaceBlock: WorkspaceApi['replaceBlock'] = (id, raw, citations = []) => {
      const s = latest.current
      const index = s.blocks.findIndex((b) => b.id === id)
      if (index < 0) return
      const { keys, footnotes } = keysFor(s.footnotes, citations)
      const fresh = chunk(build(raw, keys), id)
      const blocks = [...s.blocks]
      blocks.splice(index, 1, ...fresh)
      const old = s.blocks[index]
      const changedShape = fresh[0]?.kind !== old.kind || (old.data.kind === 'quiz' && fresh[0]?.data.kind === 'quiz' && fresh[0].data.questions.length !== old.data.questions.length) || (old.data.kind === 'flashcards' && fresh[0]?.data.kind === 'flashcards' && fresh[0].data.cards.length !== old.data.cards.length)
      commit(blocks, footnotes, changedShape ? { forget: [id] } : {})
    }

    return {
      ...state,
      setTitle: (t) => dispatch({ type: 'setTitle', title: t }),
      replaceDoc: (doc) => dispatch({ type: 'replace', doc }),
      reset: () => dispatch({ type: 'reset' }),
      setMarkdown: (md) => {
        const s = latest.current
        const parsed = parseDocument(md)
        const blocks = reconcileIds(s.blocks, parsed.blocks)
        const kept = new Set(blocks.map((b) => b.id))
        const gone = s.blocks.filter((b) => !kept.has(b.id)).map((b) => b.id)
        commit(blocks, parsed.footnotes, { forget: gone })
      },
      insertBlock,
      replaceBlock,
      updateBlockData: (id, data) => replaceBlock(id, blockToMarkdown(data)),
      removeBlocks: (ids) => {
        const s = latest.current
        const gone = new Set(ids)
        commit(s.blocks.filter((b) => !gone.has(b.id)), s.footnotes, { forget: ids })
      },
      moveBlock: (id, position) => {
        const s = latest.current
        const block = s.blocks.find((b) => b.id === id)
        if (!block) return
        const at = insertIndex(s.blocks, position, id)
        if (typeof at !== 'number') return
        const blocks = s.blocks.filter((b) => b.id !== id)
        blocks.splice(at, 0, block)
        commit(blocks, s.footnotes)
      },
      addCitations: (citations) => {
        const s = latest.current
        const { keys, footnotes } = keysFor(s.footnotes, citations)
        if (footnotes.size !== s.footnotes.size) dispatch({ type: 'document', markdown: serializeDocument(s.blocks, footnotes, { sourceName }), blocks: s.blocks, footnotes })
        return keys
      },
      linkSources: (id, citations) => {
        const s = latest.current
        const block = s.blocks.find((b) => b.id === id)
        if (!block) return []
        const { keys, footnotes } = keysFor(s.footnotes, citations)
        const raw = withCiteMarks(block.kind, block.raw, keys)
        commit(s.blocks.map((b) => (b.id === id ? { ...b, raw, citationKeys: citationKeysIn(raw) } : b)), footnotes)
        return keys
      },
      unlinkSource: (id, key) => {
        const s = latest.current
        const block = s.blocks.find((b) => b.id === id)
        if (!block) return
        const blocks = [...s.blocks]
        blocks.splice(blocks.indexOf(block), 1, ...chunk(withoutCiteMark(block.raw, key), id))
        commit(blocks, s.footnotes)
      },
      addHighlight: (partial) => {
        const highlight: Highlight = { id: newId('h'), createdAt: Date.now(), ...partial }
        dispatch({ type: 'addHighlight', highlight })
        return highlight
      },
      removeHighlight: (id) => dispatch({ type: 'removeHighlight', id }),
      answerQuiz: (blockId, questionIndex, option) => dispatch({ type: 'answerQuiz', key: `${blockId}:${questionIndex}`, option }),
      reveal: (blockId, cardIndex, revealed) => dispatch({ type: 'reveal', key: `${blockId}:${cardIndex}`, revealed }),
      setRawView: (on) => dispatch({ type: 'setRawView', on }),
      select: (id) => dispatch({ type: 'select', id }),
      startCollecting: (target = null) => dispatch({ type: 'startCollecting', target }),
      stopCollecting: () => dispatch({ type: 'stopCollecting' }),
      collect: (citation) => dispatch({ type: 'collect', citation }),
      uncollect: (index) => dispatch({ type: 'uncollect', index }),
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
      citationsOf: (block) => block.citationKeys.map((k) => latest.current.footnotes.get(k)).filter((c): c is Citation => c !== undefined),
      getState: () => latest.current,
    }
  }, [state, dispatch, sourceName])

  return <Context.Provider value={api}>{children}</Context.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useWorkspace(): WorkspaceApi {
  const api = useContext(Context)
  if (!api) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return api
}
