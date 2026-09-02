import type { Anchor, Rect } from './types'

export type SelectionResult = { ok: true; anchor: Anchor; clientRect: DOMRect } | { ok: false; reason: 'empty' | 'outside' | 'multi-page' }

function sheetOf(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement ?? null
  return el?.closest<HTMLElement>('.sheet') ?? null
}

/** Merges rects that sit on the same line (pdf.js emits one per text span). */
export function mergeLines(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Rect[] = []
  for (const r of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(r.y - last.y) < Math.min(r.h, last.h) * 0.6) {
      const x0 = Math.min(last.x, r.x)
      const x1 = Math.max(last.x + last.w, r.x + r.w)
      const y0 = Math.min(last.y, r.y)
      const y1 = Math.max(last.y + last.h, r.y + r.h)
      lines[lines.length - 1] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    } else {
      lines.push({ ...r })
    }
  }
  return lines
}

/**
 * A selection that runs across a page footer can sweep up a rotated margin
 * span (arXiv stamps, watermarks) whose rect spans most of the page. Anything
 * far taller than the typical line is dropped.
 */
function dropOutliers(rects: Rect[]): Rect[] {
  if (rects.length < 2) return rects
  const heights = rects.map((r) => r.h).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)]
  const kept = rects.filter((r) => r.h <= median * 2.5)
  return kept.length > 0 ? kept : rects
}

/** Turns the live DOM selection into an anchor, if it sits inside a single sheet. */
export function anchorFromSelection(selection: Selection | null, scale: number): SelectionResult {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return { ok: false, reason: 'empty' }
  const range = selection.getRangeAt(0)
  const startSheet = sheetOf(range.startContainer)
  const endSheet = sheetOf(range.endContainer)
  if (!startSheet || !endSheet) return { ok: false, reason: 'outside' }
  if (startSheet !== endSheet) return { ok: false, reason: 'multi-page' }

  const page = Number(startSheet.dataset.pageNumber)
  const bands = Array.from(startSheet.querySelectorAll<HTMLElement>('.sheet-band')).map((el) => ({
    rect: el.getBoundingClientRect(),
    y0: Number(el.dataset.y0),
  }))

  const rects: Rect[] = []
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue
    const midY = r.top + r.height / 2
    const band = bands.find((b) => midY >= b.rect.top && midY <= b.rect.bottom)
    if (!band) continue
    rects.push({
      x: (r.left - band.rect.left) / scale,
      y: (r.top - band.rect.top) / scale + band.y0,
      w: r.width / scale,
      h: r.height / scale,
    })
  }
  if (rects.length === 0) return { ok: false, reason: 'empty' }

  const text = selection.toString().replace(/\s+/g, ' ').trim()
  return { ok: true, anchor: { page, rects: mergeLines(dropOutliers(rects)), text }, clientRect: range.getClientRects()[0] ?? range.getBoundingClientRect() }
}
