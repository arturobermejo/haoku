import { useEffect, useRef, type CSSProperties } from 'react'
import { RenderingCancelledException, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import type { PageDims } from '../pdf/types'
import { HIGHLIGHT_META } from '../workspace/types'
import { useReader } from './readerContext'

interface PdfPageProps {
  proxy: PDFDocumentProxy
  pageNumber: number
  dims: PageDims
  scale: number
  /** False for sheets far from the viewport: they keep their size but hold no bitmap. */
  shouldRender: boolean
}

/** One page: canvas, text layer, and the washes of its highlights and the active passage. */
export function PdfPage({ proxy, pageNumber, dims, scale, shouldRender }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const { highlights, active } = useReader()

  useEffect(() => {
    const canvas = canvasRef.current
    const textContainer = textRef.current
    if (!canvas || !textContainer) return
    if (!shouldRender) {
      canvas.width = 0
      canvas.height = 0
      return
    }
    let cancelled = false
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null
    proxy
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        renderTask = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] })
        renderTask.promise.catch((error: unknown) => {
          if (!(error instanceof RenderingCancelledException)) console.error(`page ${pageNumber}:`, error)
        })
        textContainer.replaceChildren()
        textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container: textContainer, viewport })
        textLayer.render().catch(() => {
          // cancel() rejects the pending render; nothing to report.
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error(`page ${pageNumber}:`, error)
      })
    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
      textContainer.replaceChildren()
    }
  }, [proxy, pageNumber, scale, shouldRender])

  const style = { width: dims.width * scale, height: dims.height * scale, '--scale-factor': scale, '--user-unit': dims.userUnit } as CSSProperties
  const box = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale })

  return (
    <div className="sheet" data-page-number={pageNumber} style={style}>
      <canvas ref={canvasRef} className="sheet-canvas" />
      <div ref={textRef} className="textLayer" />
      <div className="sheet-overlay">
        {highlights
          .filter((h) => h.page === pageNumber)
          .flatMap((h) => h.rects.map((r, n) => <div key={`${h.id}-${n}`} className="wash" title={h.note ?? h.kind} style={{ ...box(r), '--wash': HIGHLIGHT_META[h.kind].wash, '--accent': HIGHLIGHT_META[h.kind].accent } as CSSProperties} />))}
        {active?.page === pageNumber && active.rects.map((r, n) => <div key={`active-${n}`} className="wash wash--active" style={box(r)} />)}
      </div>
    </div>
  )
}
