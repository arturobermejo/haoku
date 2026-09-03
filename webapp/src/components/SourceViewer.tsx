import { useCallback, useEffect, useState } from 'react'
import type { PdfDoc } from '../pdf/types'
import { clampScale, ZOOM_STEP, type ZoomMode } from '../pdf/zoom'
import { PdfReader } from '../reader/PdfReader'
import type { Anchor } from '../tools/textIndex'
import { anchorFromSelection } from '../workspace/pdfSelection'
import { useSources, type ResolvedCitation } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation, HighlightKind, ViewerTarget } from '../workspace/types'
import { ViewerToolbar, type ViewerSelection } from './ViewerToolbar'
import './SourceViewer.css'

/** The right panel while a source is open: the PDF reader, the text, or the image, at the cited passage. */
export function SourceViewer({ target }: { target: ViewerTarget }) {
  const ws = useWorkspace()
  const api = useSources()
  const source = api.byId(target.sourceId)
  const [resolution, setResolution] = useState<{ key: number; value: ResolvedCitation | null }>({ key: 0, value: null })
  const resolved = resolution.key === target.key ? resolution.value : null

  useEffect(() => {
    if (!target.citation) return
    let cancelled = false
    const key = target.key
    api
      .resolve(target.citation)
      .then((r) => {
        if (!cancelled) setResolution({ key, value: r })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [target.key, target.citation, api])

  if (!source) {
    return (
      <aside className="panel panel--right viewer">
        <div className="viewer-head">
          <span className="panel-label">source</span>
          <button type="button" className="control" onClick={ws.closeViewer}>
            ×
          </button>
        </div>
        <div className="viewer-empty">this source was removed</div>
      </aside>
    )
  }

  // A selected passage goes to the context; from there it becomes a block (+ from sources) or gets linked to one.
  const citeLabel = 'add to context'
  const cite = (citation: Citation) => ws.collect(citation)
  const gathered = ws.collected.length

  return (
    <aside className="panel panel--right viewer">
      <div className="viewer-head">
        <span className="viewer-badge">{source.kind}</span>
        <span className="viewer-name" title={source.name}>
          {source.title ?? source.name}
        </span>
        {source.kind === 'pdf' && <PdfViewerControls />}
        {gathered > 0 && (
          <span className="viewer-gathered" title="passages waiting in the context panel">
            {gathered} in context
          </span>
        )}
        <button type="button" className="control" onClick={ws.closeViewer} title="close source">
          ×
        </button>
      </div>
      {source.kind === 'pdf' && <PdfSourceView sourceId={source.id} target={target} resolved={resolved} onCite={cite} citeLabel={citeLabel} />}
      {source.kind === 'text' && <TextSourceView sourceId={source.id} resolved={resolved} onCite={cite} citeLabel={citeLabel} />}
      {source.kind === 'image' && <ImageSourceView sourceId={source.id} onCite={() => cite({ sourceId: source.id })} citeLabel={citeLabel} />}
    </aside>
  )
}

/* The PDF controls live in the head but talk to the reader through a tiny shared store. */
let zoomListeners = new Set<() => void>()
let pdfZoom: ZoomMode = { kind: 'fit' }
let pdfScale = 1
let pdfPage = { current: 1, count: 0 }
const publish = () => zoomListeners.forEach((l) => l())
function useReaderChrome() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((x) => x + 1)
    zoomListeners.add(l)
    return () => {
      zoomListeners.delete(l)
    }
  }, [])
  return { zoom: pdfZoom, scale: pdfScale, page: pdfPage }
}

function PdfViewerControls() {
  const { scale, page } = useReaderChrome()
  const setZoom = (z: ZoomMode) => {
    pdfZoom = z
    publish()
  }
  return (
    <div className="viewer-controls">
      <span className="mono-label">
        p. {page.current} / {page.count || '…'}
      </span>
      <button type="button" className="control" onClick={() => setZoom({ kind: 'manual', scale: clampScale(scale / ZOOM_STEP) })} aria-label="zoom out">
        −
      </button>
      <button type="button" className="control" onClick={() => setZoom({ kind: 'fit' })} title="fit width">
        {Math.round(scale * 100)}%
      </button>
      <button type="button" className="control" onClick={() => setZoom({ kind: 'manual', scale: clampScale(scale * ZOOM_STEP) })} aria-label="zoom in">
        +
      </button>
    </div>
  )
}

function PdfSourceView({ sourceId, target, resolved, onCite, citeLabel }: { sourceId: string; target: ViewerTarget; resolved: ResolvedCitation | null; onCite: (c: Citation) => void; citeLabel: string }) {
  const ws = useWorkspace()
  const api = useSources()
  const [loaded, setLoaded] = useState<{ id: string; doc: PdfDoc } | null>(null)
  const doc = loaded?.id === sourceId ? loaded.doc : null
  const { zoom } = useReaderChrome()

  useEffect(() => {
    let cancelled = false
    api
      .pdf(sourceId)
      .then((d) => {
        if (!cancelled) {
          setLoaded({ id: sourceId, doc: d })
          pdfPage = { current: 1, count: d.pageCount }
          publish()
        }
      })
      .catch((err: unknown) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [sourceId, api])

  const onEffectiveScale = useCallback((s: number) => {
    if (pdfScale !== s) {
      pdfScale = s
      publish()
    }
  }, [])
  const onCurrentPageChange = useCallback((p: number) => {
    if (pdfPage.current !== p) {
      pdfPage = { ...pdfPage, current: p }
      publish()
    }
  }, [])

  // Without a citation, a page-only target still scrolls to that page.
  const active = resolved ? { anchor: resolved, key: target.key } : null
  const highlights = ws.highlights.filter((h) => h.sourceId === sourceId)

  const getSelection = useCallback((): ViewerSelection | null => {
    const result = anchorFromSelection(window.getSelection(), pdfScale)
    if (!result.ok) return null
    return { text: result.anchor.text, page: result.anchor.page, anchor: result.anchor, rect: result.clientRect }
  }, [])

  const highlight = (sel: ViewerSelection, kind: HighlightKind) => {
    const anchor = sel.anchor as Anchor
    ws.addHighlight({ sourceId, page: anchor.page, rects: anchor.rects, text: anchor.text, kind })
  }

  if (!doc) return <div className="viewer-empty">opening…</div>
  return (
    <div className="viewer-body">
      <PdfReader doc={doc} zoom={zoom} highlights={highlights} active={active} onEffectiveScale={onEffectiveScale} onCurrentPageChange={onCurrentPageChange}>
        <PageJump page={target.citation ? undefined : target.page} keyOf={target.key} />
      </PdfReader>
      <ViewerToolbar getSelection={getSelection} onHighlight={highlight} onCite={(sel) => onCite({ sourceId, page: sel.page, quote: sel.text })} citeLabel={citeLabel} />
    </div>
  )
}

/** Scrolls to a page when the viewer was opened on a page without a passage. */
function PageJump({ page, keyOf }: { page: number | undefined; keyOf: number }) {
  useEffect(() => {
    if (!page) return
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`.viewer .sheet[data-page-number="${page}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [page, keyOf])
  return null
}

function TextSourceView({ sourceId, resolved, onCite, citeLabel }: { sourceId: string; resolved: ResolvedCitation | null; onCite: (c: Citation) => void; citeLabel: string }) {
  const api = useSources()
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .text(sourceId)
      .then((t) => {
        if (!cancelled) setText(t)
      })
      .catch((err: unknown) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [sourceId, api])

  useEffect(() => {
    if (!resolved) return
    const t = window.setTimeout(() => document.querySelector('.text-source mark')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    return () => window.clearTimeout(t)
  }, [resolved])

  const getSelection = useCallback((): ViewerSelection | null => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const container = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    if (!container?.closest('.text-source')) return null
    const value = sel.toString().replace(/\s+/g, ' ').trim()
    if (!value) return null
    return { text: value, page: 1, rect: range.getBoundingClientRect() }
  }, [])

  if (text === null) return <div className="viewer-empty">opening…</div>
  const parts = resolved ? [text.slice(0, resolved.start), text.slice(resolved.start, resolved.end), text.slice(resolved.end)] : [text]
  return (
    <div className="viewer-body scroll">
      <pre className="text-source">
        {parts.length === 3 ? (
          <>
            {parts[0]}
            <mark>{parts[1]}</mark>
            {parts[2]}
          </>
        ) : (
          parts[0]
        )}
      </pre>
      <ViewerToolbar getSelection={getSelection} onCite={(sel) => onCite({ sourceId, page: 1, quote: sel.text })} citeLabel={citeLabel} />
    </div>
  )
}

function ImageSourceView({ sourceId, onCite, citeLabel }: { sourceId: string; onCite: () => void; citeLabel: string }) {
  const api = useSources()
  const url = api.imageUrl(sourceId)
  const source = api.byId(sourceId)
  return (
    <div className="viewer-body scroll">
      {url ? <img className="image-source" src={url} alt={source?.name ?? ''} /> : <div className="viewer-empty">missing image</div>}
      <div className="image-meta">
        <span>
          {source?.name} · {Math.round((source?.bytes ?? 0) / 1024)} kB
        </span>
        <button type="button" className="control" onClick={onCite}>
          {citeLabel}
        </button>
      </div>
    </div>
  )
}
