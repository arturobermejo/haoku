import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSyncExternalStore } from 'react'
import { getStatus, subscribeStatus } from '../tools/webmcp'
import { downloadBlob, exportMarkdown, exportSpace, fileSlug, importSpace } from '../workspace/exchange'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import { ConfirmDialog } from './ConfirmDialog'
import { EditableText } from './EditableText'
import { PrintView } from './PrintView'
import './TopBar.css'

interface TopBarProps {
  mode: 'study' | 'practice'
  onMode: (mode: 'study' | 'practice') => void
  showSources: boolean
  showContext: boolean
  onToggleSources: () => void
  onToggleContext: () => void
}

export function TopBar({ mode, onMode, showSources, showContext, onToggleSources, onToggleContext }: TopBarProps) {
  const ws = useWorkspace()
  const sourcesApi = useSources()
  const { sources } = sourcesApi
  const webmcp = useSyncExternalStore(subscribeStatus, getStatus)
  const [menu, setMenu] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<{ kind: 'import'; file: File } | { kind: 'reset' } | null>(null)
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

  const currentDoc = () => {
    const { title, markdown, highlights, blocks, blockMeta, practice, practiceProgress } = ws.getState()
    return { version: 2 as const, title, markdown, highlights, blockIds: blocks.map((b) => b.id), blockMeta, practice, practiceProgress }
  }

  const exportMd = () => {
    setMenu(false)
    const doc = currentDoc()
    downloadBlob(new Blob([exportMarkdown(doc, sourcesApi)], { type: 'text/markdown' }), `${fileSlug(doc.title)}.md`)
    setNotice(`exported ${doc.blockIds.length} blocks as markdown`)
  }

  const exportZip = async () => {
    setMenu(false)
    setBusy('exporting…')
    try {
      const doc = currentDoc()
      const blob = await exportSpace(doc, sourcesApi)
      downloadBlob(blob, `${fileSlug(doc.title)}.haoku.zip`)
      setNotice(`exported ${doc.blockIds.length} blocks and ${sources.length} sources`)
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

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (ws.blocks.length > 0) setPending({ kind: 'import', file })
    else void runImport(file)
  }

  const runImport = async (file: File) => {
    setPending(null)
    setBusy('importing…')
    try {
      const { doc, sources: s } = await importSpace(file, sourcesApi)
      ws.replaceDoc(doc)
      setNotice(`imported ${doc.blockIds.length} blocks · ${s.added} sources added${s.reused ? `, ${s.reused} already here` : ''}`)
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'import failed')
    } finally {
      setBusy(null)
    }
  }

  const startOver = async () => {
    setPending(null)
    setBusy('clearing…')
    try {
      ws.reset()
      await sourcesApi.clear()
      setNotice('started over')
    } finally {
      setBusy(null)
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true" />
        <span className="topbar-name">Haoku</span>
      </div>

      <div className="topbar-document">
        <EditableText value={ws.title} placeholder="name this space" className="topbar-title" onChange={ws.setTitle} />
        <span className="topbar-meta">
          {sources.length} {sources.length === 1 ? 'source' : 'sources'} · {ws.blocks.length} {ws.blocks.length === 1 ? 'block' : 'blocks'}
        </span>
      </div>

      <div className="topbar-tabs" role="tablist">
        <button type="button" role="tab" className={`topbar-tab${mode === 'study' ? ' is-on' : ''}`} aria-selected={mode === 'study'} onClick={() => onMode('study')}>
          study
        </button>
        <button type="button" role="tab" className={`topbar-tab${mode === 'practice' ? ' is-on' : ''}`} aria-selected={mode === 'practice'} onClick={() => onMode('practice')}>
          practice
        </button>
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
          {busy ?? 'space'}
        </button>
        {menu && (
          <div className="topbar-menu-list" role="menu">
            <button type="button" role="menuitem" onClick={exportPdf} disabled={ws.blocks.length === 0}>
              <span>pdf</span>
              <span className="topbar-menu-hint">the document, via print</span>
            </button>
            <button type="button" role="menuitem" onClick={exportMd} disabled={ws.blocks.length === 0}>
              <span>markdown · .md</span>
              <span className="topbar-menu-hint">the document, footnotes renumbered</span>
            </button>
            <button type="button" role="menuitem" onClick={() => void exportZip()}>
              <span>space · zip</span>
              <span className="topbar-menu-hint">blocks + sources, re-importable</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); importRef.current?.click() }}>
              <span>import space…</span>
              <span className="topbar-menu-hint">from a .haoku.zip</span>
            </button>
            <div className="topbar-menu-rule" />
            <button type="button" role="menuitem" onClick={() => { setMenu(false); ws.setRawView(!ws.rawView) }}>
              <span>{ws.rawView ? 'back to blocks' : 'edit as markdown'}</span>
              <span className="topbar-menu-hint">the whole space as one text</span>
            </button>
            <div className="topbar-menu-rule" />
            <button type="button" role="menuitem" className="topbar-menu-danger" onClick={() => { setMenu(false); setPending({ kind: 'reset' }) }} disabled={ws.blocks.length === 0 && sources.length === 0}>
              <span>start over…</span>
              <span className="topbar-menu-hint">removes every block and source</span>
            </button>
          </div>
        )}
        <input ref={importRef} type="file" accept=".zip,application/zip" onChange={onImport} hidden />
      </div>
      {printing && <PrintView onDone={() => setPrinting(false)} />}
      {pending?.kind === 'import' && (
        <ConfirmDialog
          title="Replace this space?"
          body={`The ${ws.blocks.length} ${ws.blocks.length === 1 ? 'block' : 'blocks'} here will be replaced by the imported ones. Sources stay, and ⌘Z brings the blocks back.`}
          confirmLabel="replace"
          onConfirm={() => void runImport(pending.file)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'reset' && (
        <ConfirmDialog
          title="Start over?"
          body={`This removes ${ws.blocks.length} ${ws.blocks.length === 1 ? 'block' : 'blocks'} and ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}, and clears the undo history. Export the space first if you want to keep it.`}
          confirmLabel="delete everything"
          danger
          onConfirm={() => void startOver()}
          onCancel={() => setPending(null)}
        />
      )}

      <button type="button" className={`control${showSources ? '' : ' is-off'}`} onClick={onToggleSources} aria-pressed={showSources}>
        sources
      </button>
      <button type="button" className={`control${showContext ? '' : ' is-off'}`} onClick={onToggleContext} aria-pressed={showContext} disabled={ws.viewer !== null}>
        context
      </button>
    </header>
  )
}
