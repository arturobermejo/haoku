import { el, SpaceElement } from './base'
import { editable } from './editable'
import { renderMarkdown } from './inline'
import { CALLOUT_META, toneOf, type CalloutTone } from './meta'

export interface CalloutData {
  tone: CalloutTone
  title: string
  body: string
}

/**
 * <space-callout tone="warning" title="…">body markdown</space-callout>
 * Standalone the body is the element's own text (markdown, not converted by the host renderer).
 */
export class SpaceCallout extends SpaceElement<CalloutData> {
  protected parseSource(): CalloutData {
    return { tone: toneOf(this.getAttribute('tone')), title: this.getAttribute('title') ?? '', body: (this.textContent ?? '').trim() }
  }

  protected renderInto(root: HTMLElement) {
    const d = this.data
    // Attributes set by the host after the data property win, so the app can keep them in sync.
    const tone = this.hasAttribute('tone') && this.isEditable ? toneOf(this.getAttribute('tone')) : d.tone
    const title = this.isEditable && this.hasAttribute('title') ? (this.getAttribute('title') ?? '') : d.title
    const meta = CALLOUT_META[tone]
    root.className = `space-root callout callout--${tone}`
    root.append(el('span', 'callout-glyph', meta.glyph))
    const body = el('div', 'callout-body')
    if (this.isEditable) {
      body.append(editable({ value: title, placeholder: meta.label, className: 'callout-title', onCommit: (t) => this.change({ ...this.data, title: t }) }))
      body.append(editable({ value: d.body, placeholder: 'write the idea…', className: 'callout-text', multiline: true, onCommit: (b) => this.change({ ...this.data, body: b }) }))
    } else {
      if (title) body.append(el('span', 'callout-title', title.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)))
      body.append(el('div', 'callout-text', renderMarkdown(d.body, { breaks: true })))
    }
    root.append(body)
  }
}
