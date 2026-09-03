import type { Anchor } from '../tools/textIndex'
import { mergeLines } from './rect'
import type { Rect } from './types'

export type SelectionResult = { ok: true; anchor: Anchor; clientRect: DOMRect } | { ok: false; reason: 'empty' | 'outside' | 'multi-page' }

function sheetOf(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null)
  return el?.closest<HTMLElement>('.sheet') ?? null
}

/** A selection across a page footer can sweep up a rotated margin span; anything far taller than the typical line is dropped. */
function dropOutliers(rects: Rect[]): Rect[] {
  if (rects.length < 2) return rects
  const heights = rects.map((r) => r.h).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)]
  const kept = rects.filter((r) => r.h <= median * 2.5)
  return kept.length > 0 ? kept : rects
}

/** Turns the live DOM selection inside the PDF reader into an anchor, if it sits inside a single sheet. */
export function anchorFromSelection(selection: Selection | null, scale: number): SelectionResult {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return { ok: false, reason: 'empty' }
  const range = selection.getRangeAt(0)
  const startSheet = sheetOf(range.startContainer)
  const endSheet = sheetOf(range.endContainer)
  if (!startSheet || !endSheet) return { ok: false, reason: 'outside' }
  if (startSheet !== endSheet) return { ok: false, reason: 'multi-page' }

  const page = Number(startSheet.dataset.pageNumber)
  const sheetRect = startSheet.getBoundingClientRect()
  const rects: Rect[] = []
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue
    rects.push({ x: (r.left - sheetRect.left) / scale, y: (r.top - sheetRect.top) / scale, w: r.width / scale, h: r.height / scale })
  }
  if (rects.length === 0) return { ok: false, reason: 'empty' }

  const text = selection.toString().replace(/\s+/g, ' ').trim()
  return { ok: true, anchor: { page, rects: mergeLines(dropOutliers(rects)), text }, clientRect: range.getClientRects()[0] ?? range.getBoundingClientRect() }
}
