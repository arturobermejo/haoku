import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSyncExternalStore } from 'react'
import { getStatus, subscribeStatus } from '../tools/webmcp'
import { downloadBlob, exportSpace, fileSlug, importSpace } from '../workspace/exchange'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import { EditableText } from './EditableText'
import { PrintView } from './PrintView'
import './TopBar.css'

interface TopBarProps {
  showSources: boolean
  showContext: boolean
  onToggleSources: () => void
  onToggleContext: () => void
}

export function TopBar({ showSources, showContext, onToggleSources, onToggleContext }: TopBarProps) {
  const ws = useWorkspace()
  const sourcesApi = useSources()
  const { sources } = sourcesApi
  const webmcp = useSyncExternalStore(subscribeStatus, getStatus)
  const [menu, setMenu] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  const exportZip = async () => {
    setMenu(false)
    setBusy('exporting…')
    try {
      const { title, blocks, highlights, quizAnswers } = ws.getState()
      const blob = await exportSpace({ title, blocks, highlights, quizAnswers }, sourcesApi)
      downloadBlob(blob, `${fileSlug(title)}.saoku.zip`)
      setNotice(`exported ${blocks.length} blocks and ${sources.length} sources`)
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'export failed')
    } finally {
      setBusy(null)
    }
  }

  const exportPdf = () => {
    setMenu(false)
    setPrinting(true)
  }

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (ws.blocks.length > 0 && !window.confirm('Replace the current space with the imported one? You can undo with ⌘Z.')) return
    setBusy('importing…')
    try {
      const { doc, sources: s } = await importSpace(file, sourcesApi)
      ws.replaceDoc(doc)
      setNotice(`imported ${doc.blocks.length} blocks · ${s.added} sources added${s.reused ? `, ${s.reused} already here` : ''}`)
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'import failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        <span className="topbar-name">saoku</span>
      </div>

      <div className="topbar-document">
        <EditableText value={ws.title} placeholder="name this space" className="topbar-title" onChange={ws.setTitle} />
        <span className="topbar-meta">
          {sources.length} {sources.length === 1 ? 'source' : 'sources'} · {ws.blocks.length} {ws.blocks.length === 1 ? 'block' : 'blocks'}
        </span>
      </div>

      <span
        className={`mono-label topbar-webmcp${webmcp.registered > 0 ? ' is-on' : ''}`}
        title={webmcp.registered > 0 ? `${webmcp.registered} tools registered on ${webmcp.api}` : (webmcp.error ?? 'WebMCP not registered')}
      >
        webmcp{webmcp.registered > 0 ? ` · ${webmcp.registered}` : ''}
      </span>

      {notice && <span className="topbar-notice">{notice}</span>}

      <div ref={menuRef} className="topbar-menu">
        <button type="button" className="control" onClick={() => setMenu((v) => !v)} disabled={busy !== null} aria-expanded={menu} aria-haspopup="menu">
          {busy ?? 'export'}
        </button>
        {menu && (
          <div className="topbar-menu-list" role="menu">
            <button type="button" role="menuitem" onClick={exportPdf} disabled={ws.blocks.length === 0}>
              <span>pdf</span>
              <span className="topbar-menu-hint">the document, via print</span>
            </button>
            <button type="button" role="menuitem" onClick={() => void exportZip()}>
              <span>space · zip</span>
              <span className="topbar-menu-hint">blocks + sources, re-importable</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); importRef.current?.click() }}>
              <span>import space…</span>
              <span className="topbar-menu-hint">from a .saoku.zip</span>
            </button>
          </div>
        )}
        <input ref={importRef} type="file" accept=".zip,application/zip" onChange={(e) => void onImport(e)} hidden />
      </div>
      {printing && <PrintView onDone={() => setPrinting(false)} />}

      <button type="button" className={`control${showSources ? '' : ' is-off'}`} onClick={onToggleSources} aria-pressed={showSources}>
        sources
      </button>
      <button type="button" className={`control${showContext ? '' : ' is-off'}`} onClick={onToggleContext} aria-pressed={showContext} disabled={ws.viewer !== null}>
        context
      </button>
    </header>
  )
}
