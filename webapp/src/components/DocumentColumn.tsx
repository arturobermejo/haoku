import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'
import type { PdfDoc } from '../pdf/types'
import { PdfPage } from './PdfPage'
import './DocumentColumn.css'

interface DocumentColumnProps {
  doc: PdfDoc
  scale: number
  /** The scrolling workspace; pages are observed against it. */
  scrollRootRef: RefObject<HTMLElement | null>
  onCurrentPageChange: (pageNumber: number) => void
}

/** Sheets within this margin of the viewport keep a rendered bitmap. */
const RENDER_MARGIN = '75% 0px'

export function DocumentColumn({ doc, scale, scrollRootRef, onCurrentPageChange }: DocumentColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null)
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(() => new Set([1]))

  // Which sheets are close enough to the viewport to deserve a bitmap.
  useEffect(() => {
    const root = scrollRootRef.current
    const column = columnRef.current
    if (!root || !column) return

    const near = new Set<number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.pageNumber)
          if (entry.isIntersecting) near.add(n)
          else near.delete(n)
        }
        setNearPages(new Set(near))
      },
      { root, rootMargin: RENDER_MARGIN },
    )
    column.querySelectorAll<HTMLElement>('[data-page-number]').forEach((slot) => observer.observe(slot))
    return () => observer.disconnect()
  }, [doc, scrollRootRef])

  // The current page is the sheet under the vertical middle of the viewport.
  useEffect(() => {
    const root = scrollRootRef.current
    const column = columnRef.current
    if (!root || !column) return

    let frame = 0
    const update = () => {
      frame = 0
      const rootRect = root.getBoundingClientRect()
      const middle = rootRect.top + rootRect.height / 2
      let best = 1
      let bestDistance = Infinity
      column.querySelectorAll<HTMLElement>('[data-page-number]').forEach((slot) => {
        const rect = slot.getBoundingClientRect()
        const distance = middle < rect.top ? rect.top - middle : middle > rect.bottom ? middle - rect.bottom : 0
        if (distance < bestDistance) {
          bestDistance = distance
          best = Number(slot.dataset.pageNumber)
        }
      })
      onCurrentPageChange(best)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [doc, scale, scrollRootRef, onCurrentPageChange])

  return (
    <div ref={columnRef} className="document-column">
      {doc.pages.map((dims, index) => {
        const pageNumber = index + 1
        return (
          <Fragment key={pageNumber}>
            {index > 0 && (
              <div className="page-divider" aria-hidden="true">
                <span className="page-divider-line" />
                <span className="page-divider-label">page {pageNumber}</span>
                <span className="page-divider-line" />
              </div>
            )}
            <div className="sheet-slot" data-page-number={pageNumber}>
              <PdfPage
                proxy={doc.proxy}
                pageNumber={pageNumber}
                dims={dims}
                scale={scale}
                shouldRender={nearPages.has(pageNumber)}
              />
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
