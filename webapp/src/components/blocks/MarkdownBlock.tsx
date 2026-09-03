import { useMemo } from 'react'
import type { ParsedBlock } from '../../workspace/markdown/types'
import { useWorkspace } from '../../workspace/store'
import { EditableText } from '../EditableText'
import { renderBlockHtml } from './render'

/** Heading, paragraph and comparison: rendered markdown; click to edit the block's raw markdown. */
export function MarkdownBlock({ block, autoEdit }: { block: ParsedBlock; autoEdit: boolean }) {
  const ws = useWorkspace()
  const html = useMemo(() => renderBlockHtml(block), [block])
  const kind = block.data.kind
  const className = kind === 'heading' ? `heading heading--${block.data.level}` : kind === 'comparison' ? 'comparison-block' : 'paragraph'
  const placeholder = kind === 'heading' ? 'section title' : kind === 'comparison' ? 'table' : 'write…'
  return (
    <EditableText
      key={block.raw}
      as="div"
      value={block.raw}
      placeholder={placeholder}
      className={className}
      multiline={kind !== 'heading'}
      autoEdit={autoEdit}
      render={() => <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />}
      onChange={(raw) => ws.replaceBlock(block.id, kind === 'heading' && !/^#{1,3}\s/.test(raw) ? `${'#'.repeat(block.data.kind === 'heading' ? block.data.level : 2)} ${raw}` : raw)}
    />
  )
}
