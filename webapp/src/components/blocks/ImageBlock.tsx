import { useMemo } from 'react'
import { renderInline } from '../../elements/inline'
import type { ParsedBlock } from '../../workspace/markdown/types'
import { useSources } from '../../workspace/sources'
import { useWorkspace } from '../../workspace/store'
import { EditableText } from '../EditableText'

type ImageData = Extract<ParsedBlock['data'], { kind: 'image' }>

/** `![caption](space://sourceId)`: an image source in the document, caption editable. */
export function ImageBlock({ block, data }: { block: ParsedBlock; data: ImageData }) {
  const ws = useWorkspace()
  const { byId, imageUrl } = useSources()
  const source = byId(data.sourceId)
  const url = imageUrl(data.sourceId)
  const caption = useMemo(() => ({ __html: renderInline(data.caption) }), [data.caption])
  return (
    <figure className="image-block">
      {url ? <img src={url} alt={data.caption} onClick={() => ws.openViewer({ sourceId: data.sourceId })} /> : <div className="image-block-missing">the image source was removed</div>}
      <figcaption>
        <EditableText value={data.caption} placeholder="caption" className="image-caption" multiline render={() => <span dangerouslySetInnerHTML={caption} />} onChange={(caption) => ws.updateBlockData(block.id, { ...data, caption })} />
        {source && <span className="image-block-source">{source.name}</span>}
      </figcaption>
    </figure>
  )
}
