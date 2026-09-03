import { newId } from '../ids'
import type { Citation } from '../types'
import { citationKeysIn, citesAttr, isFootnoteLine, keysInData, parseFootnote } from './citations'
import { CALLOUT_TONES, isElementKind, type BlockData, type CalloutTone, type ParsedBlock, type ParsedDocument } from './types'

const ELEMENT_OPEN = /^<space-(callout|diagram|flashcards|quiz)\b([^>]*)>\s*$/
const ELEMENT_CLOSE = /^<\/space-(callout|diagram|flashcards|quiz)>\s*$/
const FENCE = /^(```|~~~)/
const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/
const IMAGE = /^!\[((?:[^[\]]|\[[^\]]*\])*)\]\(space:\/\/([^\s)]+)\)\s*$/
const TABLE_ROW = /^\|.*\|\s*$/
const TABLE_DELIM = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

export interface ParseOptions {
  /** Treat a leading level-1 heading as the document title (exports carry it that way). */
  extractTitle?: boolean
  /** Ids to hand out, positionally, before minting new ones. */
  ids?: string[]
}

/** Splits a Markdown document into blocks and footnotes. Never loses text: anything unrecognised is a paragraph. */
export function parseDocument(markdown: string, options: ParseOptions = {}): ParsedDocument {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const chunks: string[] = []
  const footnotes = new Map<string, Citation>()
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    if (isFootnoteLine(line)) {
      const def = parseFootnote(line)
      if (def) footnotes.set(def.key, def.citation)
      else chunks.push(line)
      i++
      continue
    }
    const open = ELEMENT_OPEN.exec(line)
    if (open) {
      const buf = [line]
      i++
      while (i < lines.length && lines[i].trim() !== '') {
        buf.push(lines[i])
        i++
        if (ELEMENT_CLOSE.test(buf[buf.length - 1])) break
      }
      chunks.push(buf.join('\n'))
      continue
    }
    if (FENCE.test(line)) {
      const fence = line.match(FENCE)![1]
      const buf = [line]
      i++
      while (i < lines.length) {
        buf.push(lines[i])
        i++
        if (lines[i - 1].startsWith(fence)) break
      }
      chunks.push(buf.join('\n'))
      continue
    }
    const buf = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '' && !isFootnoteLine(lines[i]) && !ELEMENT_OPEN.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    chunks.push(buf.join('\n'))
  }

  const blocks: ParsedBlock[] = []
  let title: string | undefined
  chunks.forEach((raw, index) => {
    const trimmed = raw.replace(/\s+$/, '')
    const data = classify(trimmed)
    if (options.extractTitle && index === 0 && data.kind === 'heading' && data.level === 1) {
      title = data.text
      return
    }
    const id = options.ids?.[blocks.length] ?? newId('b')
    blocks.push({ id, kind: data.kind, raw: trimmed, data, citationKeys: keysOf(trimmed, data) })
  })
  return { blocks, footnotes, ...(title !== undefined ? { title } : {}) }
}

/** Parses one block's markdown; returns null when the text holds more than one block. */
export function parseBlock(raw: string): ParsedBlock | null {
  const { blocks } = parseDocument(raw)
  return blocks.length === 1 ? blocks[0] : null
}

export function keysOf(raw: string, data: BlockData): string[] {
  const keys = [...keysInData(data)]
  for (const k of citationKeysIn(raw)) if (!keys.includes(k)) keys.push(k)
  return keys
}

function classify(raw: string): BlockData {
  const lines = raw.split('\n')
  const first = lines[0]

  const open = ELEMENT_OPEN.exec(first)
  if (open && isElementKind(open[1])) {
    const attrs = parseAttrs(open[2])
    const closeAt = lines.findIndex((l, idx) => idx > 0 && ELEMENT_CLOSE.test(l))
    const inner = lines.slice(1, closeAt === -1 ? undefined : closeAt).join('\n').trim()
    const cites = citesAttr(raw)
    if (open[1] === 'callout') {
      const tone = (CALLOUT_TONES as string[]).includes(attrs.tone ?? '') ? (attrs.tone as CalloutTone) : 'idea'
      return { kind: 'callout', tone, title: attrs.title ?? '', body: inner, cites }
    }
    const json = safeJson(inner)
    if (open[1] === 'diagram' && json) {
      const nodes = arr(json.nodes).map((n) => ({ label: str(n?.label), ...(str(n?.cite) ? { cite: str(n?.cite) } : {}) }))
      const edges = arr(json.edges)
        .map((e) => ({ from: num(e?.from), to: num(e?.to), ...(str(e?.label) ? { label: str(e?.label) } : {}) }))
        .filter((e) => e.from >= 0 && e.to >= 0 && e.from < nodes.length && e.to < nodes.length)
      return { kind: 'diagram', title: attrs.title ?? '', nodes, edges, cites }
    }
    if (open[1] === 'flashcards' && json) {
      const cards = arr(json.cards).map((c) => ({ question: str(c?.question), answer: str(c?.answer), ...(str(c?.cite) ? { cite: str(c?.cite) } : {}) }))
      return { kind: 'flashcards', cards, cites }
    }
    if (open[1] === 'quiz' && json) {
      const questions = arr(json.questions).map((q) => ({
        prompt: str(q?.prompt),
        options: arr(q?.options).map((o) => str(o)),
        answer: Math.max(0, num(q?.answer)),
        ...(str(q?.explanation) ? { explanation: str(q?.explanation) } : {}),
      }))
      return { kind: 'quiz', questions, cites }
    }
    return { kind: 'paragraph', markdown: raw }
  }

  if (lines.length === 1) {
    const h = HEADING.exec(first)
    if (h) return { kind: 'heading', text: h[2], level: h[1].length as 1 | 2 | 3 }
    const img = IMAGE.exec(first)
    if (img) return { kind: 'image', sourceId: img[2], caption: img[1] }
  }

  const delimAt = lines.findIndex((l, idx) => idx >= 1 && idx <= 2 && TABLE_DELIM.test(l) && TABLE_ROW.test(lines[idx - 1]))
  if (delimAt !== -1) {
    const title = delimAt === 2 ? first.replace(/^\*\*(.*?)\*\*/, '$1').trim() : ''
    const columns = cells(lines[delimAt - 1]).slice(1)
    const rows = lines.slice(delimAt + 1).filter((l) => TABLE_ROW.test(l)).map((l) => {
      const c = cells(l)
      return { label: c[0] ?? '', cells: columns.map((_, j) => c[j + 1] ?? '') }
    })
    return { kind: 'comparison', title, columns, rows }
  }

  return { kind: 'paragraph', markdown: raw }
}

function parseAttrs(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = unescapeAttr(m[2])
  return out
}

export const unescapeAttr = (v: string): string => v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Splits a table row on unescaped pipes. */
function cells(row: string): string[] {
  const body = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : -1)
