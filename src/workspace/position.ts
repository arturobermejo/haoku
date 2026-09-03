import type { Position } from './types'

/** The little a block needs to expose for section logic. */
export interface Sectionable {
  id: string
  kind: string
  data: unknown
}

const levelOf = (b: Sectionable): number | null => (b.kind === 'heading' ? ((b.data as { level?: number })?.level ?? 2) : null)

/** Index of the last block that still belongs to the section a heading opens. */
export function sectionEnd<B extends Sectionable>(blocks: B[], headingIndex: number): number {
  const level = blocks[headingIndex] ? levelOf(blocks[headingIndex]) : null
  if (level === null) return headingIndex
  let end = headingIndex
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    const l = levelOf(blocks[i])
    if (l !== null && l <= level) break
    end = i
  }
  return end
}

/**
 * Where a block would be inserted for a position, as an index into `blocks`
 * with `movingId` (if any) already taken out. Returns an error message when
 * the position points at a block that does not exist.
 */
export function insertIndex<B extends Sectionable>(blocks: B[], position: Position, movingId?: string): number | { error: string } {
  const list = movingId ? blocks.filter((b) => b.id !== movingId) : blocks
  if (position === 'end') return list.length
  if (position === 'start') return 0
  const refId = 'after' in position ? position.after : 'before' in position ? position.before : position.inSection
  const refIndex = list.findIndex((b) => b.id === refId)
  if (refIndex < 0) return { error: `There is no block "${refId}".` }
  if ('before' in position) return refIndex
  if ('after' in position) return refIndex + 1
  if (levelOf(list[refIndex]) === null) return { error: `"${refId}" is not a heading; in_section needs a heading block.` }
  return sectionEnd(list, refIndex) + 1
}
