import { useCallback, useEffect, useState } from 'react'
import { AugmentationsProvider } from './augment/store'
import { DropZone } from './components/DropZone'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { closeDocument, openDocument } from './pdf/openDocument'
import type { PdfDoc } from './pdf/types'
import { clampScale, ZOOM_STEP, type ZoomMode } from './pdf/zoom'
import { clearLastDocument, loadLastDocument, saveLastDocument } from './storage/lastDocument'
import './App.css'

export default function App() {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [zoom, setZoom] = useState<ZoomMode>({ kind: 'reading' })
  const [scale, setScale] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)

  // Reopen whatever was open last time.
  useEffect(() => {
    let cancelled = false
    loadLastDocument()
      .then(async (stored) => {
        if (!stored || cancelled) return
        const restored = await openDocument(stored.blob, stored.name)
        if (cancelled) {
          closeDocument(restored)
          return
        }
        setDoc(restored)
      })
      .catch((err: unknown) => console.error('could not restore last document', err))
      .finally(() => {
        if (!cancelled) setRestoring(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const open = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const opened = await openDocument(file, file.name)
      if (doc) closeDocument(doc)
      setDoc(opened)
      setZoom({ kind: 'reading' })
      setCurrentPage(1)
      await saveLastDocument(file, file.name)
    } catch (err: unknown) {
      console.error(err)
      setError(`could not open ${file.name}`)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (doc) closeDocument(doc)
    setDoc(null)
    void clearLastDocument()
  }

  const onEffectiveScale = useCallback((s: number) => setScale(s), [])
  const onCurrentPageChange = useCallback((n: number) => setCurrentPage(n), [])

  if (restoring) return <div className="app-restoring canvas-grid" />
  if (!doc) return <DropZone onFile={open} busy={busy} error={error} />

  return (
    <AugmentationsProvider fingerprint={doc.fingerprint}>
      <div className="app">
        <TopBar
        title={doc.title}
        pageCount={doc.pageCount}
        currentPage={currentPage}
        scale={scale}
        onZoomIn={() => setZoom({ kind: 'manual', scale: clampScale(scale * ZOOM_STEP) })}
        onZoomOut={() => setZoom({ kind: 'manual', scale: clampScale(scale / ZOOM_STEP) })}
        onFitWidth={() => setZoom({ kind: 'fit' })}
        onReadingWidth={() => setZoom({ kind: 'reading' })}
        onClose={close}
      />
        <Workspace doc={doc} zoom={zoom} onEffectiveScale={onEffectiveScale} onCurrentPageChange={onCurrentPageChange} />
      </div>
    </AugmentationsProvider>
  )
}
