import type { Citation } from '../types'
import { footnoteLine, rewriteKeys } from './citations'
import type { BlockData, ParsedBlock } from './types'

export const escapeAttr = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function element(tag: string, attrs: Record<string, string | undefined>, inner: string): string {
  const attrText = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${escapeAttr(v!)}"`)
    .join('')
  // Custom elements are CommonMark HTML blocks (type 7): they end at a blank line, so the body must not contain one.
  const body = inner.replace(/\n{2,}/g, '\n').trim()
  return `<space-${tag}${attrText}>\n${body ? `${body}\n` : ''}</space-${tag}>`
}

/** JSON for the element bodies: one collection item per line, never a blank line. */
const json = (value: Record<string, unknown>): string =>
  `{${Object.entries(value)
    .map(([k, v]) => `\n "${k}": ${Array.isArray(v) ? (v.length ? `[${v.map((x) => `\n  ${JSON.stringify(x)}`).join(',')}\n ]` : '[]') : JSON.stringify(v)}`)
    .join(',')}\n}`

const cell = (v: string): string => v.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()

/** The markdown for a block's data; the inverse of `parse.classify`. */
export function blockToMarkdown(data: BlockData): string {
  switch (data.kind) {
    case 'heading':
      return `${'#'.repeat(data.level)} ${data.text.trim()}`
    case 'paragraph':
      return data.markdown.trim()
    case 'image':
      return `![${data.caption.replace(/\n+/g, ' ')}](space://${data.sourceId})`
    case 'comparison': {
      const head = `| | ${data.columns.map(cell).join(' | ')} |`
      const delim = `|---|${data.columns.map(() => '---').join('|')}|`
      const rows = data.rows.map((r) => `| ${cell(r.label)} | ${data.columns.map((_, j) => cell(r.cells[j] ?? '')).join(' | ')} |`)
      const title = data.title.trim()
      return [...(title ? [`**${title}**`] : []), head, delim, ...rows].join('\n')
    }
    case 'callout':
      return element('callout', { tone: data.tone, title: data.title, cites: data.cites.join(' ') || undefined }, data.body)
    case 'diagram':
      return element(
        'diagram',
        { title: data.title, cites: data.cites.join(' ') || undefined },
        json({ nodes: data.nodes.map((n) => ({ label: n.label, ...(n.cite ? { cite: n.cite } : {}) })), edges: data.edges.map((e) => ({ from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) })) }),
      )
    case 'flashcards':
      return element('flashcards', { cites: data.cites.join(' ') || undefined }, json({ cards: data.cards.map((c) => ({ question: c.question, answer: c.answer, ...(c.cite ? { cite: c.cite } : {}) })) }))
    case 'quiz':
      return element('quiz', { cites: data.cites.join(' ') || undefined }, json({ questions: data.questions.map((q) => ({ prompt: q.prompt, options: q.options, answer: q.answer, ...(q.explanation ? { explanation: q.explanation } : {}) })) }))
  }
}

export interface SerializeOptions {
  /** Renumber footnotes 1..n by order of first use (exports); otherwise keys are kept as they are. */
  renumber?: boolean
  /** Written as a leading `# title`. */
  title?: string
  /** Source names for the footnote labels. */
  sourceName?: (sourceId: string) => string
}

/** Joins blocks and the footnotes they use back into one document. Unused footnotes are dropped. */
export function serializeDocument(blocks: ParsedBlock[], footnotes: Map<string, Citation>, options: SerializeOptions = {}): string {
  const used: string[] = []
  for (const b of blocks) for (const k of b.citationKeys) if (!used.includes(k) && footnotes.has(k)) used.push(k)
  const map = new Map<string, string>()
  if (options.renumber) used.forEach((k, i) => map.set(k, String(i + 1)))
  const name = options.sourceName ?? ((id) => id)
  const parts: string[] = []
  if (options.title) parts.push(`# ${options.title.trim()}`)
  for (const b of blocks) parts.push(map.size ? rewriteKeys(b.raw, map) : b.raw)
  if (used.length) parts.push(used.map((k) => footnoteLine(map.get(k) ?? k, footnotes.get(k)!, name(footnotes.get(k)!.sourceId))).join('\n'))
  return parts.join('\n\n') + (parts.length ? '\n' : '')
}
