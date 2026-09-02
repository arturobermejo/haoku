import type { CSSProperties } from 'react'
import type { Band } from '../augment/bands'
import { unionRect } from '../augment/geometry'
import { useAugmentations } from '../augment/store'
import { anchorsOf, hasCard, KIND_META, kindOf, washesText, type Anchor, type Augmentation, type Rect } from '../augment/types'
import { RewritePanel } from './RewritePanel'
import './SheetOverlay.css'

interface SheetOverlayProps {
  pageNumber: number
  band: Band
  scale: number
}

/** Everything drawn on top of one band of a page: highlights, markers, rewrite panels, fold handles. */
export function SheetOverlay({ pageNumber, band, scale }: SheetOverlayProps) {
  const aug = useAugmentations()
  const { y0, y1 } = band

  const inBand = (r: Rect) => r.y + r.h > y0 && r.y < y1
  const box = (r: Rect): CSSProperties => ({ left: r.x * scale, top: (r.y - y0) * scale, width: r.w * scale, height: r.h * scale })
  const markerStyle = (anchor: Anchor): CSSProperties | null => {
    const last = anchor.rects[anchor.rects.length - 1]
    if (!inBand(last)) return null
    return { left: (last.x + last.w) * scale + 4, top: (last.y + last.h / 2 - y0) * scale - 9 }
  }

  const markerFor = (item: Augmentation, anchor: Anchor, key: string, glyph: string, accent: string, folded: boolean, onClick: () => void) => {
    const style = markerStyle(anchor)
    if (!style) return null
    return (
      <button
        key={key}
        type="button"
        className={`marker${folded ? '' : ' is-on'}${aug.selectedId === item.id ? ' is-selected' : ''}`}
        style={{ ...style, '--accent': accent } as CSSProperties}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        title={folded ? 'show' : 'hide'}
      >
        {glyph}
      </button>
    )
  }

  const children: React.ReactNode[] = []

  for (const item of aug.items) {
    const selected = aug.selectedId === item.id
    const kind = kindOf(item)
    const meta = KIND_META[kind]

    if (item.type === 'fold') {
      if (item.page !== pageNumber || item.collapsed || item.y0 < y0 || item.y0 > y1) continue
      children.push(
        <button
          key={item.id}
          type="button"
          className="fold-handle"
          style={{ top: (item.y0 - y0) * scale, height: Math.max(18, (item.y1 - item.y0) * scale) }}
          onClick={(e) => {
            e.stopPropagation()
            aug.toggleCollapse(item.id)
          }}
          title="collapse this section"
        >
          <span>fold ↑</span>
        </button>,
      )
      continue
    }

    if (item.type === 'rewrite') {
      if (item.anchor.page !== pageNumber) continue
      const union = unionRect(item.anchor.rects)
      if (!inBand(union)) continue
      if (item.showRewrite) {
        // Only the band that holds the block's top draws the panel; it may run past the band.
        if (union.y < y0) continue
        children.push(<RewritePanel key={item.id} item={item} bandY0={y0} scale={scale} />)
      } else {
        for (const [n, r] of item.anchor.rects.entries()) {
          if (inBand(r)) children.push(<div key={`${item.id}-${n}`} className="underline underline--rewrite" style={box(r)} />)
        }
        const style = markerStyle(item.anchor)
        if (style)
          children.push(
            <button
              key={`${item.id}-flip`}
              type="button"
              className="flip flip--inline"
              style={style}
              onClick={(e) => {
                e.stopPropagation()
                aug.flipRewrite(item.id)
              }}
            >
              ⇄ rewrite
            </button>,
          )
      }
      continue
    }

    if (item.type === 'diagram') {
      for (const node of item.nodes) {
        if (node.anchor.page !== pageNumber) continue
        children.push(markerFor(item, node.anchor, `${item.id}-${node.id}`, meta.glyph, meta.accent, item.folded, () => aug.toggleFold(item.id)))
      }
      continue
    }

    // highlight, note, flashcard
    for (const [a, anchor] of anchorsOf(item).entries()) {
      if (anchor.page !== pageNumber) continue
      const washed = washesText(item)
      for (const [n, r] of anchor.rects.entries()) {
        if (!inBand(r)) continue
        children.push(
          <div
            key={`${item.id}-${a}-${n}`}
            className={`${washed ? 'wash' : 'underline'}${selected ? ' is-selected' : ''}`}
            style={{ ...box(r), '--accent': meta.accent, '--wash': meta.highlight ?? 'transparent' } as CSSProperties}
          />,
        )
      }
      if (!washed || (hasCard(item) && item.type !== 'highlight')) {
        children.push(markerFor(item, anchor, `${item.id}-${a}-marker`, meta.glyph, meta.accent, item.folded, () => (hasCard(item) ? aug.toggleFold(item.id) : aug.select(selected ? null : item.id))))
      }
    }
  }

  return <div className="sheet-overlay">{children}</div>
}
