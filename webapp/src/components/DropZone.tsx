import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import './DropZone.css'

interface DropZoneProps {
  onFile: (file: File) => void
  /** Set while a previous file is still being parsed. */
  busy?: boolean
  error?: string | null
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function DropZone({ onFile, busy = false, error = null }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const accept = (file: File | undefined) => {
    if (!file) return
    if (!isPdf(file)) {
      setRejected(`${file.name} is not a PDF`)
      return
    }
    setRejected(null)
    onFile(file)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files[0])
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!dragging) setDragging(true)
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    accept(event.target.files?.[0])
    event.target.value = ''
  }

  const message = error ?? rejected

  return (
    <div className="dropzone canvas-grid" onDrop={onDrop} onDragOver={onDragOver} onDragLeave={() => setDragging(false)}>
      <div className="dropzone-body">
        <span className="mono-label">saoku · pdf reader</span>
        <h1 className="dropzone-title">Drop a PDF to start reading.</h1>
        <p className="dropzone-lead">
          The document stays the interface. Everything you open stays in this browser — nothing is uploaded.
        </p>

        <div className={`dropzone-sheet${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}>
          <span className="dropzone-hint">{busy ? 'opening…' : dragging ? 'release to open' : 'drop it here — or'}</span>
          <button type="button" className="control control--primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            choose a file
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={onChange} hidden />
        </div>

        {message && <span className="dropzone-error">{message}</span>}
      </div>
    </div>
  )
}
