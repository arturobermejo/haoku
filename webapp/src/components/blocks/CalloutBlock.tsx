import { useWorkspace } from '../../workspace/store'
import { CALLOUT_META, type Block, type BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'callout' }>

export function CalloutBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  const meta = CALLOUT_META[content.tone]
  const set = (patch: Partial<Content>) => ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, ...patch } }))
  return (
    <div className={`callout callout--${content.tone}`}>
      <span className="callout-glyph">{meta.glyph}</span>
      <div className="callout-body">
        <EditableText value={content.title} placeholder={meta.label} className="callout-title" onChange={(title) => set({ title })} />
        <EditableText value={content.body} placeholder="write…" multiline autoEdit={content.body === '' && content.title === ''} className="callout-text" onChange={(body) => set({ body })} />
      </div>
    </div>
  )
}
