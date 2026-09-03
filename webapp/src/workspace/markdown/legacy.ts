import type { BlockMeta, Citation, Highlight, WorkspaceDoc } from '../types'
import { parseDocument } from './parse'
import { footnoteLine, sameCitation, withCiteMarks } from './citations'
import { blockToMarkdown } from './serialize'
import type { BlockData } from './types'

/** The pre-markdown block model, kept only to migrate stored workspaces and old exports. */
export interface LegacyBlock {
  id: string
  content:
    | { type: 'heading'; text: string; level: 1 | 2 | 3 }
    | { type: 'paragraph'; text: string }
    | { type: 'callout'; title: string; body: string; tone: 'idea' | 'example' | 'warning' | 'why' }
    | { type: 'diagram'; title: string; nodes: { id: string; label: string; citation?: Citation }[]; edges: { from: string; to: string; label?: string }[] }
    | { type: 'comparison'; title: string; columns: string[]; rows: { label: string; cells: string[] }[] }
    | { type: 'flashcards'; cards: { id: string; question: string; answer: string; citation?: Citation }[] }
    | { type: 'quiz'; questions: { id: string; prompt: string; options: string[]; answer: number; explanation?: string }[] }
    | { type: 'image'; sourceId: string; caption: string }
  citations: Citation[]
}

export interface LegacyDoc {
  title: string
  blocks: (LegacyBlock & { by?: 'user' | 'agent'; createdAt?: number })[]
  highlights?: Highlight[]
  /** Keyed by question id in the old model. */
  quizAnswers?: Record<string, number>
}

export const isLegacyDoc = (doc: unknown): doc is LegacyDoc => !!doc && typeof doc === 'object' && Array.isArray((doc as LegacyDoc).blocks) && !('markdown' in (doc as object))

/** Converts a legacy block document into markdown with footnotes. Quiz progress is not carried over. */
export function legacyToMarkdown(doc: LegacyDoc, sourceName: (id: string) => string = (id) => id): string {
  const footnotes = new Map<string, Citation>()
  const keyFor = (c: Citation): string => {
    for (const [k, v] of footnotes) if (sameCitation(v, c)) return k
    const k = String(footnotes.size + 1)
    footnotes.set(k, c)
    return k
  }
  const parts: string[] = []
  for (const block of doc.blocks) {
    const c = block.content
    const blockKeys = block.citations.map(keyFor)
    let raw: string
    switch (c.type) {
      case 'heading':
        raw = withCiteMarks('heading', blockToMarkdown({ kind: 'heading', text: c.text, level: c.level }), blockKeys)
        break
      case 'paragraph': {
        // `[n]` referred to block.citations[n − 1].
        let used = false
        const text = c.text.replace(/\[(\d+)\]/g, (m, n: string) => {
          const k = blockKeys[Number(n) - 1]
          if (!k) return m
          used = true
          return `[^${k}]`
        })
        raw = used ? text : withCiteMarks('paragraph', text, blockKeys)
        break
      }
      case 'callout':
        raw = blockToMarkdown({ kind: 'callout', tone: c.tone, title: c.title, body: c.body, cites: blockKeys })
        break
      case 'diagram': {
        const index = new Map(c.nodes.map((n, i) => [n.id, i]))
        const data: BlockData = {
          kind: 'diagram',
          title: c.title,
          nodes: c.nodes.map((n) => ({ label: n.label, ...(n.citation ? { cite: keyFor(n.citation) } : {}) })),
          edges: c.edges.filter((e) => index.has(e.from) && index.has(e.to)).map((e) => ({ from: index.get(e.from)!, to: index.get(e.to)!, ...(e.label ? { label: e.label } : {}) })),
          cites: blockKeys,
        }
        raw = blockToMarkdown(data)
        break
      }
      case 'comparison':
        raw = withCiteMarks('comparison', blockToMarkdown({ kind: 'comparison', title: c.title, columns: c.columns, rows: c.rows }), blockKeys)
        break
      case 'flashcards':
        raw = blockToMarkdown({ kind: 'flashcards', cards: c.cards.map((k) => ({ question: k.question, answer: k.answer, ...(k.citation ? { cite: keyFor(k.citation) } : {}) })), cites: blockKeys })
        break
      case 'quiz':
        raw = blockToMarkdown({ kind: 'quiz', questions: c.questions.map((q) => ({ prompt: q.prompt, options: q.options, answer: q.answer, ...(q.explanation ? { explanation: q.explanation } : {}) })), cites: blockKeys })
        break
      case 'image':
        raw = withCiteMarks('image', blockToMarkdown({ kind: 'image', sourceId: c.sourceId, caption: c.caption }), blockKeys)
        break
    }
    parts.push(raw)
  }
  const defs = [...footnotes].map(([k, cite]) => footnoteLine(k, cite, sourceName(cite.sourceId)))
  return [...parts, ...(defs.length ? [defs.join('\n')] : [])].join('\n\n') + (parts.length ? '\n' : '')
}

/** A stored legacy document as today's WorkspaceDoc: same block ids, answers re-keyed, metadata kept. */
export function migrateLegacy(doc: LegacyDoc, sourceName: (id: string) => string = (id) => id): WorkspaceDoc {
  const markdown = legacyToMarkdown(doc, sourceName)
  const blockIds = doc.blocks.map((b) => b.id)
  const parsed = parseDocument(markdown, { ids: blockIds })
  const blockMeta: Record<string, BlockMeta> = {}
  const quizAnswers: Record<string, number> = {}
  doc.blocks.forEach((b) => {
    blockMeta[b.id] = { by: b.by ?? 'user', createdAt: b.createdAt ?? Date.now() }
    if (b.content.type === 'quiz') {
      b.content.questions.forEach((q, i) => {
        const picked = doc.quizAnswers?.[q.id]
        if (picked !== undefined) quizAnswers[`${b.id}:${i}`] = picked
      })
    }
  })
  return { version: 2, title: doc.title, markdown, highlights: doc.highlights ?? [], quizAnswers, blockIds: parsed.blocks.map((b) => b.id), blockMeta }
}
