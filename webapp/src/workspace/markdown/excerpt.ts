import type { ParsedBlock } from './types'

/** Inline markdown and citation marks stripped, for one-line summaries. */
export function plainText(md: string): string {
  return md
    .replace(/\[\^\w+\]/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function blockExcerpt(block: ParsedBlock, max = 120): string {
  const d = block.data
  const text = (() => {
    switch (d.kind) {
      case 'heading':
        return d.text
      case 'paragraph':
        return d.markdown
      case 'callout':
        return d.title ? `${d.title}: ${d.body}` : d.body
      case 'diagram':
        return d.nodes.map((n) => n.label).join(' → ')
      case 'comparison':
        return `${d.columns.join(' vs ')} · ${d.rows.map((r) => r.label).join(', ')}`
      case 'image':
        return d.caption || 'image'
    }
  })()
  const flat = plainText(text)
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export function blockTitle(block: ParsedBlock): string {
  const d = block.data
  switch (d.kind) {
    case 'heading':
      return plainText(d.text)
    case 'callout':
      return plainText(d.title) || 'callout'
    case 'diagram':
    case 'comparison':
      return plainText(d.title) || blockExcerpt(block, 60)
    case 'paragraph':
      return blockExcerpt(block, 70)
    case 'image':
      return plainText(d.caption) || 'image'
  }
}

/** The mono label above a block; headings, paragraphs and images carry none. */
export function blockLabel(block: ParsedBlock): string | null {
  const d = block.data
  switch (d.kind) {
    case 'callout':
      return 'callout'
    case 'diagram':
      return 'diagram'
    case 'comparison':
      return 'comparison'
    default:
      return null
  }
}
