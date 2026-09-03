import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'heading' }>

export function HeadingBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  return (
    <div className={`heading heading--${content.level}`}>
      <EditableText value={content.text} placeholder="section title" autoEdit={content.text === ''} className="heading-text" onChange={(text) => ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, text } }))} />
    </div>
  )
}
