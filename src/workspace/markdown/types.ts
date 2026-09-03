import type { Citation } from '../types'

/**
 * The document is a Markdown string. Blocks are derived from it: one per top-level chunk.
 * Interactive blocks are `<space-*>` custom elements carrying JSON; citations are footnotes `[^k]`.
 */
export type BlockKind = 'heading' | 'paragraph' | 'callout' | 'diagram' | 'comparison' | 'image'
export const BLOCK_KINDS: BlockKind[] = ['heading', 'paragraph', 'callout', 'diagram', 'comparison', 'image']

export type CalloutTone = 'idea' | 'example' | 'warning' | 'why'
export const CALLOUT_TONES: CalloutTone[] = ['idea', 'example', 'warning', 'why']

export interface DiagramNode {
  label: string
  /** Footnote key of the passage this node comes from. */
  cite?: string
}
export interface DiagramEdge {
  /** 0-based node indexes. */
  from: number
  to: number
  label?: string
}
export interface ComparisonRow {
  label: string
  cells: string[]
}

export type BlockData =
  | { kind: 'heading'; text: string; level: 1 | 2 | 3 }
  | { kind: 'paragraph'; markdown: string }
  | { kind: 'callout'; tone: CalloutTone; title: string; body: string; cites: string[] }
  | { kind: 'diagram'; title: string; nodes: DiagramNode[]; edges: DiagramEdge[]; cites: string[] }
  | { kind: 'comparison'; title: string; columns: string[]; rows: ComparisonRow[] }
  | { kind: 'image'; sourceId: string; caption: string }

export interface ParsedBlock {
  id: string
  kind: BlockKind
  /** The block's own markdown, trimmed, without surrounding blank lines. */
  raw: string
  data: BlockData
  /** Footnote keys referenced anywhere in the block, in order of appearance. */
  citationKeys: string[]
}

export interface ParsedDocument {
  blocks: ParsedBlock[]
  /** Footnote key → citation. */
  footnotes: Map<string, Citation>
  /** A leading `# title`, when asked to extract it (exports carry the space title that way). */
  title?: string
}

export const ELEMENT_KINDS = ['callout', 'diagram'] as const satisfies readonly BlockKind[]
export type ElementKind = (typeof ELEMENT_KINDS)[number]
export const isElementKind = (kind: string): kind is ElementKind => (ELEMENT_KINDS as readonly string[]).includes(kind)
