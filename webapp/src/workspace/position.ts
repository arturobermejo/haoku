import type { Block, Position } from './types'

/** Index of the last block that still belongs to the section a heading opens. */
export function sectionEnd(blocks: Block[], headingIndex: number): number {
  const heading = blocks[headingIndex]
  if (heading?.content.type !== 'heading') return headingIndex
  const level = heading.content.level
  let end = headingIndex
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    const c = blocks[i].content
    if (c.type === 'heading' && c.level <= level) break
    end = i
  }
  return end
}

/**
 * Where a block would be inserted for a position, as an index into `blocks`
 * with `movingId` (if any) already taken out. Returns an error message when
 * the position points at a block that does not exist.
 */
export function insertIndex(blocks: Block[], position: Position, movingId?: string): number | { error: string } {
  const list = movingId ? blocks.filter((b) => b.id !== movingId) : blocks
  if (position === 'end') return list.length
  if (position === 'start') return 0
  const refId = 'after' in position ? position.after : 'before' in position ? position.before : position.inSection
  const refIndex = list.findIndex((b) => b.id === refId)
  if (refIndex < 0) return { error: `There is no block "${refId}".` }
  if ('before' in position) return refIndex
  if ('after' in position) return refIndex + 1
  if (list[refIndex].content.type !== 'heading') return { error: `"${refId}" is not a heading; in_section needs a heading block.` }
  return sectionEnd(list, refIndex) + 1
}
