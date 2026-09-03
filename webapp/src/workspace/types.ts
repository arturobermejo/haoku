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

/** What persists for the workspace itself (sources are stored separately). The document is Markdown. */
export interface WorkspaceDoc {
  version: 2
  title: string
  markdown: string
  highlights: Highlight[]
  /** Block ids by position, so metadata survives a reload. */
  blockIds: string[]
  blockMeta: Record<string, BlockMeta>
  /** The practice bank: the multiple-choice questions, outside the document. */
  practice?: PracticeItem[]
  /** Per practice item. */
  practiceProgress?: Record<string, PracticeProgress>
}

/** A multiple-choice question in the practice bank. */
export interface PracticeItem {
  id: string
  prompt: string
  options: string[]
  /** 0-based index into options. */
  answer: number
  explanation?: string
  citation?: Citation
  topic?: string
  by: 'user' | 'agent'
  createdAt: number
}

export interface PracticeProgress {
  seen: number
  right: number
  wrong: number
  /** Timestamp of the last attempt. */
  last: number
}

export interface BlockMeta {
  by: 'user' | 'agent'
  createdAt: number
}
