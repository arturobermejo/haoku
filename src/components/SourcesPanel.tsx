import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { sections } from '../workspace/coverage'
import { buildDemoProject, DEMO_TITLE, fetchDemoFiles } from '../workspace/demo'
import { useSources } from '../workspace/sources'
import { urlLabel } from '../workspace/urls'
import { useWorkspace } from '../workspace/store'
import type { Source } from '../workspace/types'
import { ConfirmDialog } from './ConfirmDialog'
import './SourcesPanel.css'

const KIND_BADGE: Record<Source['kind'], string> = { pdf: 'PDF', text: 'TXT', image: 'IMG' }

function relativeTime(ts: number): string {
  const minutes = Math.round((Date.now() - ts) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

function metaOf(source: Source): string {
  const what = source.url ? urlLabel(source.url) : source.kind === 'pdf' ? `${source.pages ?? '?'} pp` : source.kind === 'image' ? 'image' : `${Math.max(1, Math.round(source.bytes / 1024))} kB`
  return `${what} · added ${relativeTime(source.addedAt)}`
}

export function SourcesPanel({ onPaste }: { onPaste: () => void }) {
  const api = useSources()
  const ws = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)
  const [confirmDemo, setConfirmDemo] = useState(false)

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const { rejected } = await api.add(files)
      if (rejected.length) setMessage({ text: rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '), bad: true })
    } finally {
      setBusy(false)
    }
  }

  /** The demo sources, a document that cites them, and the practice questions that go with it. */
  const loadDemo = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const files = await fetchDemoFiles(api.sources.map((s) => s.name))
      const { rejected } = await api.add(files)
      if (rejected.length) {
        setMessage({ text: rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '), bad: true })
        return
      }
      const project = await buildDemoProject(api)
      if (!project) {
        setMessage({ text: 'the demo sources are here, but the document could not be built', bad: true })
        return
      }
      ws.replaceDoc({ version: 2, title: DEMO_TITLE, markdown: project.markdown, highlights: [], blockIds: [], blockMeta: {}, practice: project.practice, practiceProgress: {} })
      setMessage({ text: `demo project loaded · ${project.practice.length} practice questions`, bad: false })
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'could not load the demo project', bad: true })
    } finally {
      setBusy(false)
    }
  }

  // Loading it replaces the document, so a space with something in it gets a question first.
  const askDemo = () => {
    if (ws.blocks.length > 0 || ws.practice.length > 0) setConfirmDemo(true)
    else void loadDemo()
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  const covered = sections(ws.blocks)

  return (
    <aside
      className={`panel panel--left sources-panel scroll${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="panel-label sources-heading">sources</div>

      <div className="sources-list">
        {api.sources.map((source) => (
          <div key={source.id} className={`source-card${ws.viewer?.sourceId === source.id ? ' is-open' : ''}`} onClick={() => ws.openViewer({ sourceId: source.id })} role="button" tabIndex={0}>
            <span className="source-badge">{KIND_BADGE[source.kind]}</span>
            <span className="source-body">
              <span className="source-name">{source.title ?? source.name}</span>
              <span className="source-meta">{metaOf(source)}</span>
            </span>
            <button
              type="button"
              className="source-remove"
              title="remove source"
              onClick={(e) => {
                e.stopPropagation()
                if (ws.viewer?.sourceId === source.id) ws.closeViewer()
                void api.remove(source.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="sources-actions">
        <button type="button" className="sources-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'adding…' : dragging ? 'release to add' : '+ add file'}
        </button>
        <button type="button" className="sources-add" onClick={onPaste} disabled={busy} title="add text you copied from a web page or anywhere else">
          + paste text
        </button>
      </div>
      <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf,text/*,.txt,.md,.markdown,image/*" onChange={onChange} hidden />
      <div className="sources-hint">
        pdf · text · image
        {api.sources.length === 0 && (
          <>
            {' · '}
            <button type="button" className="sources-demo" onClick={askDemo} disabled={busy}>
              load demo project
            </button>
          </>
        )}
      </div>
      {message && <div className={`sources-message${message.bad ? '' : ' sources-message--ok'}`}>{message.text}</div>}

      {confirmDemo && (
        <ConfirmDialog
          title="Load the demo project?"
          body="It adds the demo sources and replaces the document and the practice questions in this space."
          confirmLabel="load it"
          onConfirm={() => {
            setConfirmDemo(false)
            void loadDemo()
          }}
          onCancel={() => setConfirmDemo(false)}
        />
      )}

      {covered.length > 0 && (
        <>
          <div className="panel-label sources-heading sources-heading--covered">what you've covered</div>
          <div className="covered-list">
            {covered.map((s) => (
              <button key={s.headingId} type="button" className={`covered-row covered-row--${s.status}`} onClick={() => ws.focusBlock(s.headingId)} style={{ paddingLeft: 6 + (s.level - 1) * 14 }}>
                <span className="covered-mark">{s.status === 'done' ? '✓' : '?'}</span>
                <span className="covered-title">{s.title || 'untitled section'}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
