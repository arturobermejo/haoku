import { type CSSProperties, type MouseEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { FOLD_STRIP_HEIGHT, sheetHeightPx } from '../augment/bands'
import { rectContains } from '../augment/geometry'
import { useAugmentations } from '../augment/store'
import { hasCard, type Augmentation } from '../augment/types'
import type { PageDims } from '../pdf/types'
import { PdfBand } from './PdfBand'
import { useWorkspace } from './workspaceContext'
import './PdfPage.css'

interface PdfPageProps {
  proxy: PDFDocumentProxy
  pageNumber: number
  dims: PageDims
  scale: number
  /** False for sheets far from the viewport: they keep their size but hold no bitmap. */
  shouldRender: boolean
}

/** Which anchored text sits under a click: washed highlights and folded-back rewrites. */
function clickTargets(items: Augmentation[], page: number): Augmentation[] {
  return items.filter((i) => (i.type === 'highlight' && i.anchor.page === page) || (i.type === 'rewrite' && !i.showRewrite && i.anchor.page === page))
}

export function PdfPage({ proxy, pageNumber, dims, scale, shouldRender }: PdfPageProps) {
  const { bandsByPage } = useWorkspace()
  const aug = useAugmentations()
  const bands = bandsByPage.get(pageNumber) ?? [{ kind: 'visible' as const, y0: 0, y1: dims.height }]

  // Highlights never block the text (pointer-events: none), so clicks are hit-tested here.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    const target = event.target as Element
    if (target.closest('button, textarea, input, .rewrite-panel')) return
    const bandEl = target.closest<HTMLElement>('.sheet-band')
    if (!bandEl) return
    const rect = bandEl.getBoundingClientRect()
    const x = (event.clientX - rect.left) / scale
    const y = (event.clientY - rect.top) / scale + Number(bandEl.dataset.y0)

    const hit = clickTargets(aug.items, pageNumber)
      .reverse()
      .find((i) => (i.type === 'highlight' || i.type === 'rewrite') && i.anchor.rects.some((r) => rectContains(r, x, y)))
    if (!hit) {
      aug.select(null)
      return
    }
    if (hit.type === 'rewrite') aug.flipRewrite(hit.id)
    else if (hasCard(hit)) aug.toggleFold(hit.id)
    else aug.select(aug.selectedId === hit.id ? null : hit.id)
  }

  const style = {
    width: dims.width * scale,
    height: sheetHeightPx(bands, scale),
    '--scale-factor': scale,
    '--user-unit': dims.userUnit,
  } as CSSProperties

  return (
    <div className="sheet" data-page-number={pageNumber} style={style} onClick={onClick}>
      {bands.map((band) => {
        switch (band.kind) {
          case 'visible':
            // Keyed on the top edge only: a cut moving below a band must not remount it (and the rewrite panel measuring inside it).
            return <PdfBand key={`band-${band.y0}`} proxy={proxy} pageNumber={pageNumber} band={band} pageHeight={dims.height} scale={scale} shouldRender={shouldRender} />
          case 'strip':
            return (
              <button
                key={`fold-${band.y0}`}
                type="button"
                className="fold-strip"
                style={{ height: FOLD_STRIP_HEIGHT }}
                onClick={() => aug.toggleCollapse(band.foldId)}
                title="expand this section"
              >
                <span>¶ folded · {Math.round(band.y1 - band.y0)} pt</span>
                <span className="fold-strip-action">expand ↓</span>
              </button>
            )
          case 'hidden':
            return null
          case 'gap':
            return <div key={`gap-${band.y0}`} className="sheet-gap" style={{ height: band.px }} />
        }
      })}
    </div>
  )
}
