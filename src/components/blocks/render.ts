import { renderInline, renderMarkdown } from '../../elements/inline'
import type { ParsedBlock } from '../../workspace/markdown/types'

/** Safe HTML for the markdown-native block kinds; elements and images are rendered by their own components. */
export function renderBlockHtml(block: ParsedBlock): string {
  const d = block.data
  switch (d.kind) {
    case 'heading':
      return renderInline(d.text)
    case 'paragraph':
      return renderMarkdown(d.markdown)
    case 'comparison': {
      // The title line and the table are rendered apart, so nothing depends on tables interrupting paragraphs.
      const lines = block.raw.split('\n')
      const tableFrom = lines.findIndex((l) => /^\|/.test(l.trim()))
      const title = d.title ? `<div class="block-title">${renderInline(d.title)}</div>` : ''
      return `${title}<div class="comparison-scroll">${renderMarkdown(lines.slice(Math.max(0, tableFrom)).join('\n'))}</div>`
    }
    default:
      return renderMarkdown(block.raw)
  }
}
