import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { computeBands, pageYToSheetPx, sheetPxToPageY, type Band, type Cut } from '../augment/bands'
import { anchorPoint, unionRect } from '../augment/geometry'
import { useAugmentations } from '../augment/store'
import type { Anchor } from '../augment/types'
import type { PdfDoc } from '../pdf/types'
import { resolveScale, WORKSPACE_GUTTER, type ZoomMode } from '../pdf/zoom'
import { CardsAndThreads } from './CardsAndThreads'
import { DocumentColumn } from './DocumentColumn'
import { SelectionToolbar } from './SelectionToolbar'
import { WorkspaceContext, type Halo, type SheetFrame, type WorkspaceApi } from './workspaceContext'
import './Workspace.css'

interface WorkspaceProps {
  doc: PdfDoc
  zoom: ZoomMode
  onEffectiveScale: (scale: number) => void
  onCurrentPageChange: (pageNumber: number) => void
}

const HALO_MS = 1200

/**
 * The 2D canvas the document sits on. The sheets stay centred; the gutters on
 * both sides hold the cards, and threads tie them to their anchors.
 */
export function Workspace({ doc, zoom, onEffectiveScale, onCurrentPageChange }: WorkspaceProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const aug = useAugmentations()

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    setContainerWidth(root.clientWidth)
    const observer = new ResizeObserver(() => setContainerWidth(root.clientWidth))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const widestPage = Math.max(...doc.pages.map((p) => p.width))
  const scale = resolveScale(zoom, widestPage, containerWidth || 1200)
  const columnWidth = Math.ceil(widestPage * scale)
  const innerWidth = Math.max(containerWidth, columnWidth + 2 * WORKSPACE_GUTTER)

  // Layout effect so the topbar sees the new scale before the next click can read it.
  useLayoutEffect(() => onEffectiveScale(scale), [scale, onEffectiveScale])

  // Rewrite panels measure themselves; the page reflows around that height.
  const [rewriteHeights, setRewriteHeights] = useState<Map<string, number>>(new Map())
  const reportRewriteHeight = useCallback((id: string, px: number | null) => {
    setRewriteHeights((prev) => {
      const current = prev.get(id)
      if (px === null ? current === undefined : current === px) return prev
      const next = new Map(prev)
      if (px === null) next.delete(id)
      else next.set(id, px)
      return next
    })
  }, [])

  // Bands only change when a cut does, so key the memo on the cuts alone.
  const cutsByPage = new Map<number, Cut[]>()
  for (const item of aug.items) {
    if (item.type === 'fold' && item.collapsed) {
      cutsByPage.set(item.page, [...(cutsByPage.get(item.page) ?? []), { id: item.id, y0: item.y0, y1: item.y1, kind: 'strip' }])
    } else if (item.type === 'rewrite' && item.showRewrite) {
      const px = rewriteHeights.get(item.id)
      if (px === undefined) continue
      const block = unionRect(item.anchor.rects)
      const cutY = block.y + px / scale
      const cut: Cut =
        cutY < block.y + block.h
          ? { id: item.id, y0: cutY, y1: block.y + block.h, kind: 'hidden' }
          : { id: item.id, at: block.y + block.h, kind: 'gap', px: px - block.h * scale }
      cutsByPage.set(item.anchor.page, [...(cutsByPage.get(item.anchor.page) ?? []), cut])
    }
  }
  const cutKey = JSON.stringify([...cutsByPage.entries()])
  const bandsByPage = useMemo(() => {
    const map = new Map<number, Band[]>()
    doc.pages.forEach((dims, index) => {
      const page = index + 1
      map.set(page, computeBands(cutsByPage.get(page) ?? [], dims.height))
    })
    return map
  }, [cutKey, doc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Where each sheet sits inside the inner canvas; cards and threads position against this.
  const [frames, setFrames] = useState<Map<number, SheetFrame>>(new Map())
  const framesKeyRef = useRef('')
  const measure = useCallback(() => {
    const inner = innerRef.current
    if (!inner) return
    const origin = inner.getBoundingClientRect()
    const next = new Map<number, SheetFrame>()
    inner.querySelectorAll<HTMLElement>('.sheet').forEach((sheet) => {
      const r = sheet.getBoundingClientRect()
      next.set(Number(sheet.dataset.pageNumber), { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height })
    })
    const key = JSON.stringify([...next.entries()])
    if (key === framesKeyRef.current) return
    framesKeyRef.current = key
    setFrames(next)
  }, [])

  useLayoutEffect(measure, [measure, scale, innerWidth, bandsByPage, doc])
  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const observer = new ResizeObserver(measure)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [measure])

  // Keep the document centred until the user pans sideways; a zoom change recentres.
  const userPannedRef = useRef(false)
  const autoScrollLeftRef = useRef(0)
  const prevScaleRef = useRef(scale)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    if (prevScaleRef.current !== scale) {
      root.scrollTop = root.scrollTop * (scale / prevScaleRef.current)
      prevScaleRef.current = scale
      userPannedRef.current = false
    }
    if (userPannedRef.current) return

    root.scrollLeft = Math.max(0, (root.scrollWidth - root.clientWidth) / 2)
    autoScrollLeftRef.current = root.scrollLeft
  }, [innerWidth, containerWidth, scale])

  const onScroll = () => {
    const root = rootRef.current
    if (root && Math.abs(root.scrollLeft - autoScrollLeftRef.current) > 1) userPannedRef.current = true
  }

  const [halo, setHalo] = useState<Halo | null>(null)
  const haloTimer = useRef(0)

  const api = useMemo<WorkspaceApi>(() => {
    const pageDims = (page: number) => doc.pages[page - 1]
    const pageToInner = (page: number, x: number, y: number) => {
      const frame = frames.get(page)
      const bands = bandsByPage.get(page) ?? [{ kind: 'visible' as const, y0: 0, y1: pageDims(page).height }]
      if (!frame) return { x: x * scale, y: y * scale }
      return { x: frame.left + x * scale, y: frame.top + pageYToSheetPx(bands, y, scale) }
    }
    const innerToPage = (page: number, x: number, y: number) => {
      const frame = frames.get(page)
      const bands = bandsByPage.get(page) ?? [{ kind: 'visible' as const, y0: 0, y1: pageDims(page).height }]
      if (!frame) return { x: x / scale, y: y / scale }
      return { x: (x - frame.left) / scale, y: sheetPxToPageY(bands, y - frame.top, scale) }
    }
    const jumpTo = (anchor: Anchor) => {
      const root = rootRef.current
      if (!root) return
      const p = anchorPoint(anchor, 'right')
      const point = pageToInner(anchor.page, p.x, p.y)
      const left = point.x < root.scrollLeft + 40 || point.x > root.scrollLeft + root.clientWidth - 40 ? Math.max(0, point.x - root.clientWidth / 2) : root.scrollLeft
      root.scrollTo({ top: Math.max(0, point.y - root.clientHeight / 2), left, behavior: 'smooth' })
      autoScrollLeftRef.current = left
      setHalo({ x: point.x, y: point.y, key: Date.now() })
      window.clearTimeout(haloTimer.current)
      haloTimer.current = window.setTimeout(() => setHalo(null), HALO_MS)
    }
    return { scale, frames, bandsByPage, pageDims, pageToInner, innerToPage, jumpTo, halo, reportRewriteHeight }
  }, [scale, frames, bandsByPage, doc, halo, reportRewriteHeight])

  return (
    <WorkspaceContext.Provider value={api}>
      <div ref={rootRef} className="workspace canvas-grid scroll" onScroll={onScroll} onClick={() => aug.select(null)}>
        <div ref={innerRef} className="workspace-inner" style={{ width: innerWidth }}>
          <DocumentColumn doc={doc} scale={scale} scrollRootRef={rootRef} onCurrentPageChange={onCurrentPageChange} />
          <CardsAndThreads />
        </div>
      </div>
      <SelectionToolbar />
    </WorkspaceContext.Provider>
  )
}
