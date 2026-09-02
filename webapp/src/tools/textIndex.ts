/**
 * A per-page text index built from pdf.js text content, with the geometry of
 * every run in scale-1 page units. It lets a quote — the way a person or an
 * agent refers to a passage — resolve to exact rects on any page, rendered or
 * not.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { mergeLines } from '../augment/selection'
import type { Anchor, Rect } from '../augment/types'

export interface IndexedRun {
  str: string
  /** Character range inside PageIndex.text. */
  start: number
  end: number
  rect: Rect
  /** Text direction in page units, for slicing a run by character. */
  horizontal: boolean
}

export interface PageIndex {
  page: number
  text: string
  runs: IndexedRun[]
  /** Normalised text and the map from its indices back to `text`. */
  norm: string
  map: number[]
}

export interface Match {
  page: number
  start: number
  end: number
  /** The original text of the match. */
  text: string
}

const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageIndex>>>()

/** Lowercase, drop whitespace, hyphens and soft hyphens, fold curly quotes — so quotes match across line breaks. */
export function normalise(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    let ch = text[i].toLowerCase()
    if (/[\s­\-‐‑‒–—]/.test(ch)) continue
    if (ch === '’' || ch === '‘') ch = "'"
    else if (ch === '“' || ch === '”') ch = '"'
    else if (ch === 'ﬁ') ch = 'fi'
    else if (ch === 'ﬂ') ch = 'fl'
    for (const c of ch) {
      norm += c
      map.push(i)
    }
  }
  return { norm, map }
}

interface RawItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

export function indexPage(proxy: PDFDocumentProxy, page: number): Promise<PageIndex> {
  let pages = cache.get(proxy)
  if (!pages) {
    pages = new Map()
    cache.set(proxy, pages)
  }
  let pending = pages.get(page)
  if (!pending) {
    pending = buildIndex(proxy, page)
    pages.set(page, pending)
  }
  return pending
}

async function buildIndex(proxy: PDFDocumentProxy, page: number): Promise<PageIndex> {
  const pdfPage = await proxy.getPage(page)
  const viewport = pdfPage.getViewport({ scale: 1 })
  const content = await pdfPage.getTextContent()

  let text = ''
  const runs: IndexedRun[] = []
  let previous: { rect: Rect; str: string } | null = null

  for (const raw of content.items as unknown[]) {
    const item = raw as Partial<RawItem>
    if (typeof item.str !== 'string' || !item.transform) continue
    const [a, b, c, d, e, f] = item.transform
    const width = item.width ?? 0
    const height = item.height || Math.hypot(c, d)
    const along = Math.hypot(a, b) || 1
    const up = Math.hypot(c, d) || 1
    const dx = (a / along) * width
    const dy = (b / along) * width
    const ux = (c / up) * height
    const uy = (d / up) * height
    const corners = [
      [e, f],
      [e + dx, f + dy],
      [e + ux, f + uy],
      [e + dx + ux, f + dy + uy],
    ].map(([x, y]) => viewport.convertToViewportPoint(x, y))
    const xs = corners.map((p) => p[0])
    const ys = corners.map((p) => p[1])
    const rect: Rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    const horizontal = Math.abs(a) >= Math.abs(b)

    // Whitespace-only runs carry no glyph box; skip them in the geometry but keep the spacing.
    if (item.str.trim().length === 0) {
      if (item.str.length > 0 && text.length && !/\s$/.test(text)) text += ' '
      if (item.hasEOL && !text.endsWith('\n')) text += '\n'
      continue
    }
    if (item.str.length > 0) {
      // pdf.js leaves out most inter-word spaces; put one back where runs sit apart on a line.
      if (previous && text.length && !/\s$/.test(text) && !/^\s/.test(item.str)) {
        const sameLine = Math.abs(previous.rect.y - rect.y) < Math.max(previous.rect.h, rect.h) * 0.6
        const gap = rect.x - (previous.rect.x + previous.rect.w)
        if (!sameLine || gap > rect.h * 0.12) text += sameLine ? ' ' : '\n'
      }
      const start = text.length
      text += item.str
      runs.push({ str: item.str, start, end: text.length, rect, horizontal })
      previous = { rect, str: item.str }
    }
    if (item.hasEOL && !text.endsWith('\n')) text += '\n'
  }

  const { norm, map } = normalise(text)
  return { page, text, runs, norm, map }
}

/** Every occurrence of `query` on the page, whitespace- and hyphen-insensitive. */
export function findInPage(index: PageIndex, query: string): Match[] {
  const { norm: q } = normalise(query)
  if (!q) return []
  const matches: Match[] = []
  let from = 0
  for (;;) {
    const at = index.norm.indexOf(q, from)
    if (at < 0) break
    const start = index.map[at]
    const end = index.map[at + q.length - 1] + 1
    matches.push({ page: index.page, start, end, text: index.text.slice(start, end) })
    from = at + 1
  }
  return matches
}

/** The rects covering a character range, one per line. */
export function rectsForRange(index: PageIndex, start: number, end: number): Rect[] {
  const rects: Rect[] = []
  for (const run of index.runs) {
    if (run.end <= start || run.start >= end) continue
    const len = run.end - run.start
    const from = Math.max(start, run.start) - run.start
    const to = Math.min(end, run.end) - run.start
    if (!run.horizontal || len === 0) {
      rects.push({ ...run.rect })
      continue
    }
    const x = run.rect.x + (run.rect.w * from) / len
    const w = (run.rect.w * (to - from)) / len
    rects.push({ x, y: run.rect.y, w, h: run.rect.h })
  }
  return mergeLines(rects.filter((r) => r.w > 0.5 && r.h > 1))
}

export function anchorForMatch(index: PageIndex, match: Match): Anchor {
  return { page: match.page, rects: rectsForRange(index, match.start, match.end), text: match.text.replace(/\s+/g, ' ').trim() }
}
