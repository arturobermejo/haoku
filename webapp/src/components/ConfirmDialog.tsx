import { useEffect, useRef } from 'react'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  /** Red confirm button for destructive actions. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** A modal yes/no question on the native <dialog>; Escape and the backdrop cancel. */
export function ConfirmDialog({ title, body, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.open) return
    el.showModal()
    el.querySelector<HTMLButtonElement>('.confirm-cancel')?.focus()
  }, [])

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
    >
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        <div className="confirm-body">{body}</div>
        <div className="confirm-actions">
          <button type="button" className="control confirm-cancel" onClick={onCancel}>
            cancel
          </button>
          <button type="button" className={`control ${danger ? 'control--danger' : 'control--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
