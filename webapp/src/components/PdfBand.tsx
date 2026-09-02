import { useEffect, useRef } from 'react'
import { RenderingCancelledException, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import type { Band } from '../augment/bands'
import { SheetOverlay } from './SheetOverlay'

interface PdfBandProps {
  proxy: PDFDocumentProxy
  pageNumber: number
  band: Extract<Band, { kind: 'visible' }>
  pageHeight: number
  scale: number
  shouldRender: boolean
}

/**
 * pdf.js lays text spans out as percentages of the layer's box, so the layer
 * must keep the full page size; the band clips it. Spans outside the band are
 * removed so text is never duplicated across bands.
 */
function pruneOutsideBand(container: HTMLElement, y0: number, y1: number, pageHeight: number) {
  container.querySelectorAll<HTMLElement>('span').forEach((span) => {
    if (!span.style.top) return
    const y = (parseFloat(span.style.top) / 100) * pageHeight
    const h = parseFloat(span.style.getPropertyValue('--font-height')) || 4
    if (y + h <= y0 || y >= y1) span.remove()
  })
}

/** One visible slice of a page: its own canvas, text layer and overlay. */
export function PdfBand({ proxy, pageNumber, band, pageHeight, scale, shouldRender }: PdfBandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const { y0, y1 } = band

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
        // Shifting the viewport up by y0 makes the band's top the canvas origin.
        const viewport = page.getViewport({ scale, offsetY: -y0 * scale })
        const dpr = window.devicePixelRatio || 1

        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor((y1 - y0) * scale * dpr)
        renderTask = page.render({
          canvas,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        })
        renderTask.promise.catch((error: unknown) => {
          if (!(error instanceof RenderingCancelledException)) console.error(`page ${pageNumber}:`, error)
        })

        textContainer.replaceChildren()
        textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container: textContainer, viewport })
        textLayer
          .render()
          .then(() => {
            if (!cancelled) pruneOutsideBand(textContainer, y0, y1, pageHeight)
          })
          .catch(() => {
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
  }, [proxy, pageNumber, scale, shouldRender, y0, y1, pageHeight])

  return (
    <div className="sheet-band" data-y0={y0} data-y1={y1} style={{ height: (y1 - y0) * scale }}>
      <canvas ref={canvasRef} className="sheet-canvas" />
      <div className="sheet-text-clip">
        <div ref={textRef} className="textLayer" style={{ top: -y0 * scale, height: pageHeight * scale }} />
      </div>
      <SheetOverlay pageNumber={pageNumber} band={band} scale={scale} />
    </div>
  )
}
