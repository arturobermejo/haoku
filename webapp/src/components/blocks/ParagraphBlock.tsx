import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { renderWithCitations } from '../citationText'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'paragraph' }>

export function ParagraphBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  return (
    <EditableText
      value={content.text}
      placeholder="write…"
      multiline
      autoEdit={content.text === ''}
      className="paragraph"
      render={(text) => renderWithCitations(text, block.citations)}
      onChange={(text) => ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, text } }))}
    />
  )
}
