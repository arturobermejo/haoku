import { useSources } from '../../workspace/sources'
import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'image' }>

/** An image source placed in the document, with a caption. */
export function ImageBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  const { byId, imageUrl } = useSources()
  const source = byId(content.sourceId)
  const url = imageUrl(content.sourceId)
  return (
    <figure className="image-block">
      {url ? (
        <img src={url} alt={content.caption || source?.name || ''} onClick={() => ws.openViewer({ sourceId: content.sourceId })} />
      ) : (
        <div className="image-block-missing">the image source was removed</div>
      )}
      <figcaption>
        <EditableText value={content.caption} placeholder="caption" className="image-caption" onChange={(caption) => ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, caption } }))} />
        {source && <span className="image-block-source">{source.name}</span>}
      </figcaption>
    </figure>
  )
}
