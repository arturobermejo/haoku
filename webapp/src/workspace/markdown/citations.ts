import type { Citation } from '../types'
import type { BlockData, BlockKind } from './types'

/** `[^3]` anywhere in text. */
export const CITE_RE = /\[\^(\w+)\]/g

/**
 * A footnote definition, one per line:
 *   [^3]: [episodic-memory.pdf, p. 2](space://s_2bf3b723/2#2) — "quoted passage"
 * URL: space://<sourceId>[/<page>][#<occurrence>]; the quote is optional (images, whole pages).
 */
const DEF_RE = /^\[\^(\w+)\]:\s*\[([^\]]*)\]\(space:\/\/([^/)#\s]+)(?:\/(\d+))?(?:#(\d+))?\)(?:\s*—\s*"([\s\S]*)")?\s*$/

export const isFootnoteLine = (line: string): boolean => /^\[\^\w+\]:/.test(line)

export function parseFootnote(line: string): { key: string; citation: Citation } | null {
  const m = DEF_RE.exec(line.trim())
  if (!m) return null
  const [, key, , sourceId, page, occurrence, quote] = m
  const citation: Citation = { sourceId }
  if (page) citation.page = Number(page)
  if (occurrence && Number(occurrence) > 1) citation.occurrence = Number(occurrence)
  if (quote !== undefined) citation.quote = quote.replace(/\\"/g, '"')
  return { key, citation }
}

export function footnoteLine(key: string, citation: Citation, sourceName: string): string {
  const label = `${sourceName}${citation.page ? `, p. ${citation.page}` : ''}`.replace(/[[\]]/g, '')
  const url = `space://${citation.sourceId}${citation.page ? `/${citation.page}` : ''}${citation.occurrence && citation.occurrence > 1 ? `#${citation.occurrence}` : ''}`
  const quote = citation.quote ? ` — "${citation.quote.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')}"` : ''
  return `[^${key}]: [${label}](${url})${quote}`
}

/** Footnote keys referenced in a piece of text, in order, without duplicates. */
export function citationKeysIn(text: string): string[] {
  const keys: string[] = []
  for (const m of text.matchAll(CITE_RE)) if (!keys.includes(m[1])) keys.push(m[1])
  return keys
}

/** Two citations are the same passage when every field matches. */
export const sameCitation = (a: Citation, b: Citation): boolean => a.sourceId === b.sourceId && (a.page ?? 0) === (b.page ?? 0) && (a.quote ?? '') === (b.quote ?? '') && (a.occurrence ?? 1) === (b.occurrence ?? 1)

/** The next free numeric key. */
export function nextKey(footnotes: Map<string, Citation>): string {
  let max = 0
  for (const k of footnotes.keys()) {
    const n = Number(k)
    if (Number.isInteger(n) && n > max) max = n
  }
  return String(max + 1)
}

export const marks = (keys: string[]): string => keys.map((k) => `[^${k}]`).join('')

/**
 * Appends citation marks to a block's markdown in the place that reads naturally for its kind:
 * end of the heading / paragraph / caption / table title, or the `cites` attribute of an element.
 */
export function withCiteMarks(kind: BlockKind, raw: string, keys: string[]): string {
  const fresh = keys.filter((k) => !citationKeysIn(raw).includes(k) && !citesAttr(raw).includes(k))
  if (fresh.length === 0) return raw
  const tail = ` ${marks(fresh)}`
  switch (kind) {
    case 'heading':
      return raw.replace(/\s*$/, tail)
    case 'image':
      return raw.replace(/^!\[((?:[^[\]]|\[[^\]]*\])*)\]/, (_m, cap: string) => `![${cap}${cap ? ' ' : ''}${marks(fresh)}]`)
    case 'comparison': {
      const lines = raw.split('\n')
      if (/^\|/.test(lines[0].trim())) return [marks(fresh), ...lines].join('\n')
      lines[0] = lines[0].replace(/\s*$/, tail)
      return lines.join('\n')
    }
    case 'callout':
    case 'diagram':
    case 'flashcards':
    case 'quiz':
      return setCitesAttr(raw, [...citesAttr(raw), ...fresh])
    default: {
      const lines = raw.split('\n')
      if (/^(```|~~~)/.test(lines[lines.length - 1])) return `${raw}\n${marks(fresh)}`
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*$/, tail)
      return lines.join('\n')
    }
  }
}

/** Removes every mark for `key` from a block (text marks, `cites` attribute, `cite` fields). */
export function withoutCiteMark(raw: string, key: string): string {
  return setCitesAttr(raw.replace(new RegExp(`\\s?\\[\\^${key}\\]`, 'g'), '').replace(new RegExp(`,?\\s*"cite"\\s*:\\s*"${key}"`, 'g'), ''), citesAttr(raw).filter((k) => k !== key))
}

/** Rewrites every footnote key in a block through `map` (renumbering on export). */
export function rewriteKeys(raw: string, map: Map<string, string>): string {
  const mapped = (k: string) => map.get(k) ?? k
  return setCitesAttr(
    raw.replace(CITE_RE, (_m, k: string) => `[^${mapped(k)}]`).replace(/"cite"\s*:\s*"(\w+)"/g, (_m, k: string) => `"cite":"${mapped(k)}"`),
    citesAttr(raw).map(mapped),
  )
}

/** The `cites="3 4"` attribute of an element's opening tag. */
export function citesAttr(raw: string): string[] {
  const m = /^<space-\w+\b[^>]*?\bcites="([^"]*)"/.exec(raw)
  return m ? m[1].split(/\s+/).filter(Boolean) : []
}

function setCitesAttr(raw: string, keys: string[]): string {
  if (!/^<space-\w+\b/.test(raw)) return raw
  const unique = keys.filter((k, i) => keys.indexOf(k) === i)
  const attr = unique.length ? ` cites="${unique.join(' ')}"` : ''
  if (/\bcites="[^"]*"/.test(raw.split('\n')[0])) return raw.replace(/\s*\bcites="[^"]*"/, attr)
  return raw.replace(/^(<space-\w+\b[^>]*?)(\s*\/?>)/, (_m, open: string, close: string) => `${open}${attr}${close}`)
}

/** Every key a block's data refers to (element `cites`, node/card `cite`). */
export function keysInData(data: BlockData): string[] {
  const keys: string[] = []
  const push = (k?: string) => {
    if (k && !keys.includes(k)) keys.push(k)
  }
  if ('cites' in data) data.cites.forEach(push)
  if (data.kind === 'diagram') data.nodes.forEach((n) => push(n.cite))
  if (data.kind === 'flashcards') data.cards.forEach((c) => push(c.cite))
  return keys
}
