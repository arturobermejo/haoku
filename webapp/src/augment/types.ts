/** A rectangle in scale-1 page units, origin at the sheet's top-left corner. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Where an augmentation lives in the document. Every augmentation carries at least one. */
export interface Anchor {
  /** 1-based page number. */
  page: number
  /** One rect per text line, scale-1 page units. */
  rects: Rect[]
  /** The source text under the anchor. */
  text: string
}

export type Kind = 'claim' | 'definition' | 'flashcard' | 'question' | 'evidence' | 'concept' | 'synthesis' | 'diagram'

/** A card's position, relative to the top-left corner of its page, scale-1 units. */
export interface Placement {
  page: number
  dx: number
  dy: number
}

interface Base {
  id: string
  createdAt: number
  placement?: Placement
  /** Folded back into the text: the card is hidden and only the marker shows. */
  folded: boolean
}

export type HighlightAug = Base & { type: 'highlight'; kind: Kind; anchor: Anchor; note?: string }
export type NoteAug = Base & { type: 'note'; kind: Kind; title: string; body: string; anchors: Anchor[] }
export type RewriteAug = Base & { type: 'rewrite'; anchor: Anchor; text: string; showRewrite: boolean }
export type FoldAug = Base & { type: 'fold'; page: number; y0: number; y1: number; label?: string; collapsed: boolean }
export interface DiagramNode {
  id: string
  label: string
  anchor: Anchor
}
export interface DiagramEdge {
  from: string
  to: string
  label?: string
}
export type DiagramAug = Base & { type: 'diagram'; title: string; nodes: DiagramNode[]; edges: DiagramEdge[] }
export type FlashcardAug = Base & { type: 'flashcard'; question: string; answer: string; anchor: Anchor }

export type Augmentation = HighlightAug | NoteAug | RewriteAug | FoldAug | DiagramAug | FlashcardAug
export type AugmentationType = Augmentation['type']

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
/** What callers pass to create one; id, timestamp and fold state are filled in. */
export type NewAugmentation = DistributiveOmit<Augmentation, 'id' | 'createdAt' | 'folded'> & { id?: string; folded?: boolean }

export interface KindMeta {
  glyph: string
  label: string
  /** CSS colour for chips and markers. */
  accent: string
  /** CSS colour for the text wash; null for kinds that never highlight. */
  highlight: string | null
}

export const KIND_META: Record<Kind, KindMeta> = {
  claim: { glyph: '◆', label: 'claim', accent: 'var(--kind-claim)', highlight: 'var(--kind-claim-hl)' },
  definition: { glyph: '◉', label: 'definition', accent: 'var(--kind-definition)', highlight: 'var(--kind-definition-hl)' },
  flashcard: { glyph: '★', label: 'flashcard', accent: 'var(--kind-flashcard)', highlight: 'var(--kind-flashcard-hl)' },
  question: { glyph: '?', label: 'question', accent: 'var(--kind-question)', highlight: null },
  evidence: { glyph: '●', label: 'evidence', accent: 'var(--kind-evidence)', highlight: 'var(--kind-evidence-hl)' },
  concept: { glyph: '◆', label: 'concept', accent: 'var(--kind-concept)', highlight: null },
  synthesis: { glyph: '✣', label: 'note', accent: 'var(--kind-synthesis)', highlight: null },
  diagram: { glyph: '△', label: 'diagram', accent: 'var(--kind-diagram)', highlight: null },
}

/** Kinds the selection toolbar offers for a plain highlight. */
export const HIGHLIGHT_KINDS: Kind[] = ['claim', 'definition', 'evidence', 'concept']

export function kindOf(aug: Augmentation): Kind {
  switch (aug.type) {
    case 'highlight':
    case 'note':
      return aug.kind
    case 'rewrite':
      return 'definition'
    case 'fold':
      return 'concept'
    case 'diagram':
      return 'diagram'
    case 'flashcard':
      return 'flashcard'
  }
}

export function anchorsOf(aug: Augmentation): Anchor[] {
  switch (aug.type) {
    case 'highlight':
    case 'rewrite':
    case 'flashcard':
      return [aug.anchor]
    case 'note':
      return aug.anchors
    case 'diagram':
      return aug.nodes.map((n) => n.anchor)
    case 'fold':
      return []
  }
}

/** Whether the augmentation shows up as a floating card on the workspace. */
export function hasCard(aug: Augmentation): boolean {
  switch (aug.type) {
    case 'highlight':
      return aug.note !== undefined
    case 'note':
    case 'diagram':
    case 'flashcard':
      return true
    case 'rewrite':
    case 'fold':
      return false
  }
}

/** Whether the anchor's text gets a colour wash; otherwise a marker chip stands in. */
export function washesText(aug: Augmentation): boolean {
  return aug.type === 'highlight' && KIND_META[aug.kind].highlight !== null
}

export function pageOf(aug: Augmentation): number {
  if (aug.type === 'fold') return aug.page
  return anchorsOf(aug)[0]?.page ?? 1
}
