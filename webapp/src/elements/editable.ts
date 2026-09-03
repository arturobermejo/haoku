import { el } from './base'
import { renderInline } from './inline'

interface EditableOptions {
  value: string
  placeholder: string
  className?: string
  multiline?: boolean
  /** Show the saved value as inline markdown (default) or as plain text. */
  markdown?: boolean
  onCommit: (value: string) => void
}

/**
 * Click-to-edit text without a framework: a span that turns into a textarea on click.
 * Blur saves; Enter saves single-line fields (⌘/Ctrl+Enter for multiline); Escape reverts.
 */
export function editable(options: EditableOptions): HTMLElement {
  const { value, placeholder, className = '', multiline = false, markdown = true } = options
  const span = el('span', `editable ${value ? '' : 'editable--empty'} ${className}`.trim())
  if (value) {
    if (markdown) span.innerHTML = renderInline(value)
    else span.textContent = value
  } else span.textContent = placeholder
  span.title = 'click to edit'
  span.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.cite')) return
    e.stopPropagation()
    open()
  })

  const open = () => {
    const area = el('textarea', `editable editable--input ${className}`.trim())
    area.value = value
    area.placeholder = placeholder
    area.rows = 1
    const grow = () => {
      area.style.height = 'auto'
      area.style.height = `${area.scrollHeight}px`
    }
    let done = false
    const finish = (commit: boolean) => {
      if (done) return
      done = true
      const next = area.value.trim()
      area.replaceWith(span)
      if (commit && next !== value) options.onCommit(next)
    }
    area.addEventListener('input', grow)
    area.addEventListener('blur', () => finish(true))
    area.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') finish(false)
      else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        finish(true)
      }
    })
    area.addEventListener('pointerdown', (e) => e.stopPropagation())
    span.replaceWith(area)
    area.focus()
    area.setSelectionRange(area.value.length, area.value.length)
    grow()
  }
  return span
}

/** A read-only inline-markdown span, for when the element is not editable. */
export function inline(value: string, className = ''): HTMLElement {
  return el('span', className, renderInline(value))
}
