import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import './EditableText.css'

interface EditableTextProps {
  value: string
  placeholder: string
  onChange: (value: string) => void
  multiline?: boolean
  className?: string
  /** Open in edit mode on mount; used for freshly created fields. */
  autoEdit?: boolean
  /** Where the caret lands when the editor opens. Defaults to the end. */
  caret?: 'start' | 'end'
  /** Custom display of the saved value (e.g. rendered markdown); editing still uses the raw text. */
  render?: (value: string) => React.ReactNode
  /** Display element; use `div` when the rendered value holds block-level HTML. */
  as?: 'span' | 'div'
  /** Called when editing ends, saved or not (after onChange). */
  onDone?: () => void
}

/** Double-click-to-edit text: a single click only selects the block. Blur saves; Enter saves single-line fields. */
export function EditableText({ value, placeholder, onChange, multiline = false, className = '', autoEdit = false, caret = 'end', render, as: Tag = 'span', onDone }: EditableTextProps) {
  const [editing, setEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const el = ref.current
    if (!el) return
    el.focus()
    const at = caret === 'start' ? 0 : el.value.length
    el.setSelectionRange(at, at)
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing, caret])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onChange(next)
    onDone?.()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      setDraft(value)
      setEditing(false)
      onDone?.()
    } else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      commit()
    }
    event.stopPropagation()
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        className={`editable editable--input ${className}`}
        value={draft}
        placeholder={placeholder}
        rows={1}
        onChange={(e) => {
          setDraft(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <Tag
      className={`editable ${value ? '' : 'editable--empty'} ${className}`}
      onDoubleClick={(e) => {
        e.stopPropagation()
        window.getSelection()?.removeAllRanges()
        setDraft(value)
        setEditing(true)
      }}
      title="double-click to edit"
    >
      {value ? (render ? render(value) : value) : placeholder}
    </Tag>
  )
}
