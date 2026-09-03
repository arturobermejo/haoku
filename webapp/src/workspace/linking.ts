import type { Block, Citation } from './types'

/** Appends citations to a block. A paragraph gets a [n] mark per new citation at the end of its text, unless `silent`. */
export function withCitations(block: Block, citations: Citation[], silent = false): Block {
  if (citations.length === 0) return block
  const all = [...block.citations, ...citations]
  let content = block.content
  if (content.type === 'paragraph' && !silent) {
    const marks = citations.map((_, i) => `[${block.citations.length + i + 1}]`).join('')
    content = { ...content, text: `${content.text.trimEnd()} ${marks}`.trim() }
  }
  return { ...block, citations: all, content }
}

/** Removes one citation and renumbers the [n] marks of a paragraph accordingly. */
export function withoutCitation(block: Block, index: number): Block {
  if (index < 0 || index >= block.citations.length) return block
  const citations = block.citations.filter((_, i) => i !== index)
  let content = block.content
  if (content.type === 'paragraph') {
    const text = content.text
      .replace(/\s?\[(\d+)\]/g, (m, n: string) => {
        const k = Number(n)
        if (k === index + 1) return ''
        return k > index + 1 ? m.replace(`[${k}]`, `[${k - 1}]`) : m
      })
      .trim()
    content = { ...content, text }
  }
  return { ...block, citations, content }
}

/** Adds [1][2]… at the end of a paragraph that cites sources but never marked where. */
export function ensureMarks(block: Block): Block {
  if (block.content.type !== 'paragraph' || block.citations.length === 0 || /\[\d+\]/.test(block.content.text)) return block
  const marks = block.citations.map((_, i) => `[${i + 1}]`).join('')
  return { ...block, content: { ...block.content, text: `${block.content.text.trimEnd()} ${marks}`.trim() } }
}
