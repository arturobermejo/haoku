import type { Rect } from './types'

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
