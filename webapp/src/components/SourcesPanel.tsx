import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { sections } from '../workspace/coverage'
import { DEMO_TITLE, fetchDemoFiles } from '../workspace/demo'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Source } from '../workspace/types'
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
  const parts = [source.kind === 'pdf' ? `${source.pages ?? '?'} pp` : source.kind === 'image' ? 'image' : `${Math.max(1, Math.round(source.bytes / 1024))} kB`, `added ${relativeTime(source.addedAt)}`]
  return parts.join(' · ')
}

export function SourcesPanel() {
  const api = useSources()
  const ws = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const { rejected } = await api.add(files)
      if (rejected.length) setMessage(rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '))
    } finally {
      setBusy(false)
    }
  }

  const loadDemo = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const files = await fetchDemoFiles(api.sources.map((s) => s.name))
      if (files.length === 0) {
        setMessage('the demo sources are already here')
        return
      }
      const { rejected } = await api.add(files)
      if (rejected.length) setMessage(rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '))
      if (ws.blocks.length === 0 && (ws.title === 'Untitled space' || !ws.title.trim())) ws.setTitle(DEMO_TITLE)
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'could not load the demo sources')
    } finally {
      setBusy(false)
    }
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

  const covered = sections(ws.blocks, ws.quizAnswers)

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

      <button type="button" className="sources-add" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'adding…' : dragging ? 'release to add' : '+ add source'}
      </button>
      <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf,text/*,.txt,.md,.markdown,image/*" onChange={onChange} hidden />
      <div className="sources-hint">
        pdf · text · image
        {api.sources.length === 0 && (
          <>
            {' · '}
            <button type="button" className="sources-demo" onClick={() => void loadDemo()} disabled={busy}>
              load demo sources
            </button>
          </>
        )}
      </div>
      {message && <div className="sources-message">{message}</div>}

      {covered.length > 0 && (
        <>
          <div className="panel-label sources-heading sources-heading--covered">what you've covered</div>
          <div className="covered-list">
            {covered.map((s) => (
              <button key={s.headingId} type="button" className={`covered-row covered-row--${s.status}`} onClick={() => ws.focusBlock(s.headingId)} style={{ paddingLeft: 6 + (s.level - 1) * 14 }}>
                <span className="covered-mark">{s.status === 'done' ? '✓' : s.status === 'shaky' ? '△' : '?'}</span>
                <span className="covered-title">{s.title || 'untitled section'}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
