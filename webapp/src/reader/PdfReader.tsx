import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PdfDoc } from '../pdf/types'
import { resolveScale, WORKSPACE_GUTTER, type ZoomMode } from '../pdf/zoom'
import type { Anchor } from '../tools/textIndex'
import type { Highlight } from '../workspace/types'
import { PdfColumn } from './PdfColumn'
import { ReaderContext, type Halo, type ReaderApi } from './readerContext'
import './PdfReader.css'

interface PdfReaderProps {
  doc: PdfDoc
  zoom: ZoomMode
  highlights: Highlight[]
  /** Resolved passage to scroll to and mark; the key re-triggers the jump. */
  active: { anchor: Anchor; key: number } | null
  onEffectiveScale: (scale: number) => void
  onCurrentPageChange: (page: number) => void
  children?: React.ReactNode
}

const HALO_MS = 1200

/** The scrolling canvas the source's sheets sit on, centred, with the highlights drawn over them. */
export function PdfReader({ doc, zoom, highlights, active, onEffectiveScale, onCurrentPageChange, children }: PdfReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [halo, setHalo] = useState<Halo | null>(null)
  const haloTimer = useRef(0)

  const handleCurrentPage = useCallback(
    (page: number) => {
      setCurrentPage(page)
      onCurrentPageChange(page)
    },
    [onCurrentPageChange],
  )

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    setContainerWidth(root.clientWidth)
    const observer = new ResizeObserver(() => setContainerWidth(root.clientWidth))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const widestPage = Math.max(...doc.pages.map((p) => p.width))
  const scale = resolveScale(zoom, widestPage, containerWidth || 800)
  const columnWidth = Math.ceil(widestPage * scale)
  const innerWidth = Math.max(containerWidth, columnWidth + 2 * WORKSPACE_GUTTER)
  useLayoutEffect(() => onEffectiveScale(scale), [scale, onEffectiveScale])

  // Where each sheet sits inside the scrolling canvas.
  const frameOf = useCallback((page: number) => {
    const inner = innerRef.current
    const sheet = inner?.querySelector<HTMLElement>(`.sheet[data-page-number="${page}"]`)
    if (!inner || !sheet) return null
    const origin = inner.getBoundingClientRect()
    const r = sheet.getBoundingClientRect()
    return { left: r.left - origin.left, top: r.top - origin.top }
  }, [])

  const prevScaleRef = useRef(scale)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (prevScaleRef.current !== scale) {
      root.scrollTop = root.scrollTop * (scale / prevScaleRef.current)
      prevScaleRef.current = scale
    }
    root.scrollLeft = Math.max(0, (root.scrollWidth - root.clientWidth) / 2)
  }, [innerWidth, containerWidth, scale])

  const jumpTo = useCallback(
    (anchor: Anchor) => {
      const root = rootRef.current
      const frame = frameOf(anchor.page)
      if (!root || !frame) return
      const last = anchor.rects[anchor.rects.length - 1]
      const first = anchor.rects[0]
      const x = frame.left + (last.x + last.w) * scale
      const y = frame.top + (first.y + (last.y + last.h - first.y) / 2) * scale
      root.scrollTo({ top: Math.max(0, y - root.clientHeight / 2), behavior: 'smooth' })
      setHalo({ x, y, key: Date.now() })
      window.clearTimeout(haloTimer.current)
      haloTimer.current = window.setTimeout(() => setHalo(null), HALO_MS)
    },
    [frameOf, scale],
  )

  const scrollToPage = useCallback(
    (page: number) => {
      const root = rootRef.current
      const frame = frameOf(page)
      if (!root || !frame) return
      root.scrollTo({ top: Math.max(0, frame.top - 24), behavior: 'smooth' })
    },
    [frameOf],
  )

  // Jump when the active passage changes (or the same one is opened again), once the sheets have laid out.
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => jumpTo(active.anchor), 60)
    return () => window.clearTimeout(timer)
  }, [active?.key, doc]) // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo<ReaderApi>(
    () => ({ scale, currentPage, pageDims: (page) => doc.pages[page - 1], highlights, active: active?.anchor ?? null, jumpTo, scrollToPage, halo }),
    [scale, currentPage, doc, highlights, active, jumpTo, scrollToPage, halo],
  )

  return (
    <ReaderContext.Provider value={api}>
      <div ref={rootRef} className="reader canvas-grid scroll">
        <div ref={innerRef} className="reader-inner" style={{ width: innerWidth }}>
          <PdfColumn doc={doc} scale={scale} scrollRootRef={rootRef} onCurrentPageChange={handleCurrentPage} />
          <svg className="reader-halo-layer" aria-hidden="true">
            {halo && <circle key={halo.key} className="halo" cx={halo.x} cy={halo.y} r="16" fill="none" stroke="var(--link)" strokeWidth="1.5" />}
          </svg>
        </div>
        {children}
      </div>
    </ReaderContext.Provider>
  )
}
