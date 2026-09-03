import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSources } from '../workspace/sources'
import type { Source } from '../workspace/types'
import './PasteSourceDialog.css'

interface PasteSourceDialogProps {
  onAdded: (source: Source) => void
  onCancel: () => void
}

/**
 * Text pasted from anywhere as a source, in a modal: the text itself, and optionally what to call it
 * and the page it came from. Without a title the source is named after the text's first line.
 */
export function PasteSourceDialog({ onAdded, onCancel }: PasteSourceDialogProps) {
  const api = useSources()
  const ref = useRef<HTMLDialogElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.open) return
    el.showModal()
    areaRef.current?.focus()
  }, [])

  const ready = text.trim().length > 0 && !busy
  const submit = () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    api
      .addText({ text, title, url })
      .then(onAdded)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'could not add the text'))
      .finally(() => setBusy(false))
  }
  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <dialog
      ref={ref}
      className="paste-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
    >
      <div className="paste-panel" onKeyDown={onKeyDown}>
        <div className="paste-head">
          <div>
            <div className="paste-title">Paste text as a source</div>
            <div className="paste-sub">Anything you copied: a web page, a mail, a chat. Add the address it came from and citations will point back at it.</div>
          </div>
          <button type="button" className="paste-close" onClick={onCancel} title="close">
            ×
          </button>
        </div>

        <textarea ref={areaRef} className="paste-text" value={text} placeholder="paste the text here…" spellCheck={false} onChange={(e) => setText(e.target.value)} />

        <div className="paste-fields">
          <label className="paste-label">
            <span className="panel-label">title</span>
            <input className="paste-field" value={title} placeholder="optional — the first line by default" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="paste-label">
            <span className="panel-label">url it came from</span>
            <input className="paste-field" value={url} placeholder="optional — example.com/article" inputMode="url" onChange={(e) => setUrl(e.target.value)} />
          </label>
        </div>

        {error && <div className="paste-error">{error}</div>}

        <div className="paste-actions">
          <span className="paste-count">{text.trim() ? `${text.trim().length.toLocaleString()} characters` : 'nothing pasted yet'}</span>
          <button type="button" className="control" onClick={onCancel}>
            cancel
          </button>
          <button type="button" className="control control--primary" disabled={!ready} onClick={submit}>
            {busy ? 'adding…' : 'add source'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
