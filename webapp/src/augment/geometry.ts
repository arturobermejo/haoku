import type { Anchor, Placement, Rect } from './types'

/** Floating card width in CSS pixels; cards do not scale with the document. */
export const CARD_WIDTH = 300
/** Pixels between a sheet edge and a default-placed card. */
export const CARD_GAP = 32

export function unionRect(rects: Rect[]): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** The point a thread attaches to: end of the last line, or start of the first. */
export function anchorPoint(anchor: Anchor, side: 'left' | 'right'): { x: number; y: number } {
  const rects = anchor.rects
  if (side === 'right') {
    const last = rects[rects.length - 1]
    return { x: last.x + last.w, y: last.y + last.h / 2 }
  }
  const first = rects[0]
  return { x: first.x, y: first.y + first.h / 2 }
}

/** Cards alternate gutters; `index` is the card's position among the page's cards. */
export function defaultPlacement(anchor: Anchor, pageWidth: number, index: number, scale: number): Placement {
  const right = index % 2 === 0
  return {
    page: anchor.page,
    dx: right ? pageWidth + CARD_GAP / scale : -(CARD_WIDTH + CARD_GAP) / scale,
    dy: anchor.rects[0].y - 8 / scale,
  }
}
