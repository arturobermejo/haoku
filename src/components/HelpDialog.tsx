import { useEffect, useRef } from 'react'
import './HelpDialog.css'

const STEPS: { label: string; text: string }[] = [
  { label: 'sources', text: 'Add PDFs, text files, images, or paste text. Click one to read it beside the document.' },
  { label: 'gather', text: 'Select a passage in an open source and press “add to context”. It waits in the panel on the right.' },
  { label: 'build', text: '“+ from sources” turns what you gathered into a block, with the citation attached. “+ block” writes one from scratch; double-click any block to edit it.' },
  { label: 'check', text: 'A mark like [1] selects its block. Its passages are listed in context, and open the source at the right page.' },
  { label: 'practise', text: 'The practice tab asks questions built from those same passages, and remembers how you did.' },
  { label: 'your agent', text: 'No chat box here: the app publishes itself as WebMCP tools and the agent in your browser uses them.' },
]

/** The short version of how the app works, opened from the ? button. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || el.open) return
    el.showModal()
    el.querySelector<HTMLButtonElement>('.help-close')?.focus()
  }, [])

  return (
    <dialog
      ref={ref}
      className="help-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="help-panel">
        <div className="help-head">
          <div className="help-title">How Haoku works</div>
          <button type="button" className="help-close" onClick={onClose} title="close">
            ×
          </button>
        </div>

        <div className="help-steps">
          {STEPS.map((s) => (
            <div key={s.label} className="help-step">
              <span className="panel-label">{s.label}</span>
              <p>{s.text}</p>
            </div>
          ))}
        </div>

        <div className="help-foot">Everything stays in this browser. ⌘Z undoes; the “space” menu exports the document or the whole space.</div>
      </div>
    </dialog>
  )
}
