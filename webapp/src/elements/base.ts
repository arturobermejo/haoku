/**
 * Base for the `space-*` elements. Light DOM on purpose: the host page's stylesheet (or elements.css)
 * styles them, print rules apply, and the app's delegated listeners see their citation marks.
 *
 * Data arrives either as a property (`el.data = …`, the app path) or, standalone, from the element's
 * initial text / attributes (the markdown path), read once before the first render.
 */
export abstract class SpaceElement<D> extends HTMLElement {
  static get observedAttributes() {
    return ['editable', 'print', 'title', 'tone', 'cites']
  }

  #data: D | null = null
  #ready = false

  get data(): D {
    if (this.#data === null) this.#data = this.parseSource()
    return this.#data
  }
  set data(value: D) {
    this.#data = value
    if (this.#ready) this.render()
  }

  connectedCallback() {
    if (this.#ready) {
      this.render()
      return
    }
    // When the definition runs before the parser reached our children, they are not there yet.
    if (this.#data === null && this.ownerDocument.readyState === 'loading') {
      this.ownerDocument.addEventListener('DOMContentLoaded', () => this.#init(), { once: true })
      return
    }
    this.#init()
  }

  #init() {
    if (this.#data === null) this.#data = this.parseSource()
    this.#ready = true
    this.render()
  }

  attributeChangedCallback() {
    if (this.#ready) this.render()
  }

  // Named apart from the attributes: React assigns a prop as a property when the element has one of that name.
  get isEditable(): boolean {
    return this.hasAttribute('editable')
  }
  get isPrinting(): boolean {
    return this.hasAttribute('print')
  }

  /** Reads the initial content (JSON text or markdown) into data. */
  protected abstract parseSource(): D
  protected abstract renderInto(root: HTMLElement): void

  render() {
    const root = document.createElement('div')
    root.className = 'space-root'
    this.renderInto(root)
    this.replaceChildren(root)
    root.querySelectorAll<HTMLElement>('.cite[data-key]').forEach((mark) => {
      mark.addEventListener('click', (e) => {
        e.stopPropagation()
        this.emit('space-cite', { key: mark.dataset.key })
      })
    })
  }

  /** Bubbling, composed event; returns false when a listener prevented the default. */
  protected emit(name: 'space-change' | 'space-answer' | 'space-reveal' | 'space-cite', detail: unknown): boolean {
    return this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true }))
  }

  /** Applies an edit: re-renders and tells the host. */
  protected change(next: D) {
    this.#data = next
    this.render()
    this.emit('space-change', { data: next })
  }

  protected jsonSource(): Record<string, unknown> | null {
    try {
      const v: unknown = JSON.parse((this.textContent ?? '').trim() || 'null')
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
}

export const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
export const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback)

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, html?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html !== undefined) node.innerHTML = html
  return node
}

export function button(className: string, label: string, onClick: (e: MouseEvent) => void, title?: string): HTMLButtonElement {
  const b = el('button', className)
  b.type = 'button'
  b.textContent = label
  if (title) b.title = title
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick(e)
  })
  return b
}
