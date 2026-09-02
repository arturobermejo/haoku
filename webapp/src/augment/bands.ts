/**
 * A page is rendered as a stack of vertical bands. Folds and rewrites cut the
 * page: a collapsed fold becomes a strip, the tail of a rewritten block is
 * hidden, and a rewrite longer than its block opens a gap. Units are scale-1
 * page points unless a field says px.
 */
export type Band =
  | { kind: 'visible'; y0: number; y1: number }
  | { kind: 'strip'; y0: number; y1: number; foldId: string }
  | { kind: 'hidden'; y0: number; y1: number; ownerId: string }
  | { kind: 'gap'; y0: number; y1: number; px: number; ownerId: string }

export type Cut = { id: string; y0: number; y1: number; kind: 'strip' | 'hidden' } | { id: string; at: number; kind: 'gap'; px: number }

/** Height in CSS pixels of the strip standing in for a collapsed band. */
export const FOLD_STRIP_HEIGHT = 28

function cutStart(cut: Cut): number {
  return cut.kind === 'gap' ? cut.at : cut.y0
}

/** Splits a page around its cuts. Cuts that overlap an earlier one are skipped. */
export function computeBands(cuts: Cut[], pageHeight: number): Band[] {
  const sorted = cuts
    .filter((c) => (c.kind === 'gap' ? c.px > 0 : c.y1 > c.y0))
    .sort((a, b) => cutStart(a) - cutStart(b) || (a.kind === 'gap' ? 1 : -1))

  const bands: Band[] = []
  let cursor = 0
  for (const cut of sorted) {
    const start = Math.max(0, cutStart(cut))
    if (start < cursor) continue
    if (start > cursor) bands.push({ kind: 'visible', y0: cursor, y1: start })
    if (cut.kind === 'gap') {
      bands.push({ kind: 'gap', y0: start, y1: start, px: cut.px, ownerId: cut.id })
      cursor = start
      continue
    }
    const end = Math.min(pageHeight, cut.y1)
    if (cut.kind === 'strip') bands.push({ kind: 'strip', y0: start, y1: end, foldId: cut.id })
    else bands.push({ kind: 'hidden', y0: start, y1: end, ownerId: cut.id })
    cursor = end
  }
  if (cursor < pageHeight || bands.length === 0) bands.push({ kind: 'visible', y0: cursor, y1: pageHeight })
  return bands
}

export function bandHeightPx(band: Band, scale: number): number {
  switch (band.kind) {
    case 'visible':
      return (band.y1 - band.y0) * scale
    case 'strip':
      return FOLD_STRIP_HEIGHT
    case 'hidden':
      return 0
    case 'gap':
      return band.px
  }
}

export function sheetHeightPx(bands: Band[], scale: number): number {
  return bands.reduce((sum, b) => sum + bandHeightPx(b, scale), 0)
}

/** Maps a page y (scale-1) to a pixel offset from the sheet's top, through the bands. */
export function pageYToSheetPx(bands: Band[], y: number, scale: number): number {
  let offset = 0
  for (const band of bands) {
    if (band.kind === 'gap') {
      offset += band.px
      continue
    }
    if (y < band.y1 || band === bands[bands.length - 1]) {
      if (band.kind === 'visible') return offset + (y - band.y0) * scale
      if (band.kind === 'strip') return offset + FOLD_STRIP_HEIGHT / 2
      return offset
    }
    offset += bandHeightPx(band, scale)
  }
  return offset
}

/** Inverse of pageYToSheetPx: a pixel offset inside the sheet back to a page y. */
export function sheetPxToPageY(bands: Band[], px: number, scale: number): number {
  let offset = 0
  for (const band of bands) {
    const h = bandHeightPx(band, scale)
    if (px < offset + h || band === bands[bands.length - 1]) {
      if (band.kind === 'visible') return band.y0 + (px - offset) / scale
      return band.y0
    }
    offset += h
  }
  return bands[bands.length - 1].y1
}
