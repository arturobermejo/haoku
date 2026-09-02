import { useEffect, useRef, type CSSProperties } from 'react'
import { unionRect } from '../augment/geometry'
import { useAugmentations } from '../augment/store'
import type { Rect, RewriteAug } from '../augment/types'
import { EditableText } from './EditableText'
import { useWorkspace } from './workspaceContext'

interface RewritePanelProps {
  item: RewriteAug
  /** Top of the band this panel is drawn in, scale-1 units. */
  bandY0: number
  scale: number
}

const REPORT_DELAY = 120

/** Type metrics borrowed from the original lines so the rewrite sets like the document itself. */
function metrics(rects: Rect[]): { fontPt: number; leadingPt: number } {
  const heights = rects.map((r) => r.h).sort((a, b) => a - b)
  // Range rects run ~20% taller than the glyph box the PDF set the type in.
  const fontPt = heights[Math.floor(heights.length / 2)] * 0.8
  const tops = rects.map((r) => r.y).sort((a, b) => a - b)
  const pitches = tops.slice(1).map((y, i) => y - tops[i]).filter((p) => p > fontPt * 0.8)
  const leadingPt = pitches.length ? pitches.sort((a, b) => a - b)[Math.floor(pitches.length / 2)] : fontPt * 1.32
  return { fontPt, leadingPt }
}

/**
 * The rewritten passage, set in place of the original block: same column, same
 * size and leading, no chrome. It reports its height so the page reflows.
 */
export function RewritePanel({ item, bandY0, scale }: RewritePanelProps) {
  const aug = useAugmentations()
  const { reportRewriteHeight } = useWorkspace()
  const ref = useRef<HTMLDivElement>(null)
  const block = unionRect(item.anchor.rects)
  const { fontPt, leadingPt } = metrics(item.anchor.rects)
  const selected = aug.selectedId === item.id

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer = 0
    const report = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => reportRewriteHeight(item.id, Math.ceil(el.getBoundingClientRect().height)), REPORT_DELAY)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    // The height is left behind on unmount: a stale value only matters while
    // the rewrite is shown, and dropping it would un-cut the page mid-remount.
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [item.id, reportRewriteHeight])

  const style: CSSProperties = {
    left: block.x * scale,
    top: (block.y - bandY0) * scale,
    width: block.w * scale,
    fontSize: fontPt * scale,
    lineHeight: `${leadingPt * scale}px`,
  }

  return (
    <div ref={ref} className={`rewrite-panel${selected ? ' is-selected' : ''}`} style={style} onClick={(e) => e.stopPropagation()}>
      <EditableText
        value={item.text}
        placeholder="write the replacement…"
        multiline
        autoEdit={item.text === ''}
        className="rewrite-text"
        onChange={(text) => aug.update(item.id, (i) => (i.type === 'rewrite' ? { ...i, text } : i))}
      />
      <div className="rewrite-margin" style={{ left: block.w * scale + 10 }}>
        <button type="button" className="flip" onClick={() => aug.flipRewrite(item.id)} title="show the original text">
          ⇄ original
        </button>
        <button type="button" className="rewrite-remove" onClick={() => aug.remove(item.id)} title="remove rewrite">
          ×
        </button>
      </div>
    </div>
  )
}
