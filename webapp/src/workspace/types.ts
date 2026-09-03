/** The knowledge workspace: sources, the block document built from them, and provenance between the two. */

/** A rectangle in scale-1 page units, origin at the page's top-left corner. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type SourceKind = 'pdf' | 'text' | 'image'

export interface Source {
  id: string
  kind: SourceKind
  name: string
  mime: string
  bytes: number
  addedAt: number
  /** PDF only. */
  pages?: number
  /** PDF metadata title, when the file carries one. */
  title?: string
}

/** Where a piece of the document came from. Resolved to rects or offsets on demand. */
export interface Citation {
  sourceId: string
  /** 1-based page for PDFs; text sources are a single page. */
  page?: number
  /** The passage, quoted; whitespace and hyphenation do not matter. */
  quote?: string
  /** Which occurrence of the quote on the page; defaults to 1. */
  occurrence?: number
}

export type CalloutTone = 'idea' | 'example' | 'warning' | 'why'

export interface DiagramNode {
  id: string
  label: string
  citation?: Citation
}
export interface DiagramEdge {
  from: string
  to: string
  label?: string
}
export interface Flashcard {
  id: string
  question: string
  answer: string
  citation?: Citation
}
export interface QuizQuestion {
  id: string
  prompt: string
  options: string[]
  /** Index into options. */
  answer: number
  explanation?: string
}
export interface ComparisonRow {
  label: string
  cells: string[]
}

export type BlockContent =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  /** `[n]` in the text refers to block.citations[n − 1]. */
  | { type: 'paragraph'; text: string }
  | { type: 'callout'; title: string; body: string; tone: CalloutTone }
  | { type: 'diagram'; title: string; nodes: DiagramNode[]; edges: DiagramEdge[] }
  | { type: 'comparison'; title: string; columns: string[]; rows: ComparisonRow[] }
  | { type: 'flashcards'; cards: Flashcard[] }
  | { type: 'quiz'; questions: QuizQuestion[] }
  /** An image source shown in the document. */
  | { type: 'image'; sourceId: string; caption: string }

export type BlockType = BlockContent['type']
export const BLOCK_TYPES: BlockType[] = ['heading', 'paragraph', 'callout', 'diagram', 'comparison', 'flashcards', 'quiz', 'image']

export interface Block {
  id: string
  content: BlockContent
  citations: Citation[]
  /** The agent's note on why the block exists; shown in the context panel. */
  note?: string
  by: 'user' | 'agent'
  createdAt: number
  updatedAt: number
}

export type HighlightKind = 'claim' | 'definition' | 'evidence' | 'concept'
export const HIGHLIGHT_KINDS: HighlightKind[] = ['claim', 'definition', 'evidence', 'concept']

/** A persistent wash on a source page. */
export interface Highlight {
  id: string
  sourceId: string
  page: number
  rects: Rect[]
  text: string
  kind: HighlightKind
  note?: string
  createdAt: number
}

export const HIGHLIGHT_META: Record<HighlightKind, { glyph: string; accent: string; wash: string }> = {
  claim: { glyph: '◆', accent: 'var(--kind-claim)', wash: 'var(--kind-claim-hl)' },
  definition: { glyph: '◉', accent: 'var(--kind-definition)', wash: 'var(--kind-definition-hl)' },
  evidence: { glyph: '●', accent: 'var(--kind-evidence)', wash: 'var(--kind-evidence-hl)' },
  concept: { glyph: '◆', accent: 'var(--kind-concept)', wash: 'oklch(0.92 0.06 45 / 0.7)' },
}

export const CALLOUT_META: Record<CalloutTone, { glyph: string; label: string }> = {
  idea: { glyph: '◆', label: 'key idea' },
  example: { glyph: '●', label: 'in practice' },
  warning: { glyph: '△', label: 'careful' },
  why: { glyph: '?', label: 'why that was wrong' },
}

/** What the document is anchored on when the viewer opens. */
export interface ViewerTarget {
  sourceId: string
  page?: number
  citation?: Citation
  /** Changes on every open so the same citation can be re-opened. */
  key: number
}

/** Where a block goes in the document. */
export type Position = 'end' | 'start' | { after: string } | { before: string } | { inSection: string }

/** What persists for the workspace itself (sources are stored separately). */
export interface WorkspaceDoc {
  title: string
  blocks: Block[]
  highlights: Highlight[]
  quizAnswers: Record<string, number>
}

export function blockExcerpt(block: Block, max = 120): string {
  const c = block.content
  const text = (() => {
    switch (c.type) {
      case 'heading':
        return c.text
      case 'paragraph':
        return c.text
      case 'callout':
        return c.title ? `${c.title}: ${c.body}` : c.body
      case 'diagram':
        return c.nodes.map((n) => n.label).join(' → ')
      case 'comparison':
        return `${c.columns.join(' vs ')} · ${c.rows.map((r) => r.label).join(', ')}`
      case 'flashcards':
        return `${c.cards.length} cards: ${c.cards[0]?.question ?? ''}`
      case 'quiz':
        return `${c.questions.length} questions: ${c.questions[0]?.prompt ?? ''}`
      case 'image':
        return c.caption || 'image'
    }
  })()
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** Every citation a block carries, including the ones inside nodes and cards. */
export function citationsOf(block: Block): Citation[] {
  const c = block.content
  const nested = c.type === 'diagram' ? c.nodes.map((n) => n.citation) : c.type === 'flashcards' ? c.cards.map((k) => k.citation) : []
  return [...block.citations, ...nested.filter((x): x is Citation => x !== undefined)]
}
