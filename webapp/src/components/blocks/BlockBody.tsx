import type { ParsedBlock } from '../../workspace/markdown/types'
import { ElementBlock } from './ElementBlock'
import { ImageBlock } from './ImageBlock'
import { MarkdownBlock } from './MarkdownBlock'

export function BlockBody({ block, autoEdit = false }: { block: ParsedBlock; autoEdit?: boolean }) {
  const d = block.data
  switch (d.kind) {
    case 'image':
      return <ImageBlock block={block} data={d} />
    case 'callout':
    case 'diagram':
    case 'flashcards':
    case 'quiz':
      return <ElementBlock block={block} data={d} />
    default:
      return <MarkdownBlock block={block} autoEdit={autoEdit} />
  }
}
