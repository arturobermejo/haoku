import { plainText } from './markdown/excerpt'
import type { ParsedBlock } from './markdown/types'
import { sectionEnd } from './position'

export type SectionStatus = 'done' | 'open'

export interface Section {
  headingId: string
  title: string
  level: number
  blockCount: number
  status: SectionStatus
}

/** "What you've covered": one row per heading. A section with no blocks under it is open, else done. */
export function sections(blocks: ParsedBlock[]): Section[] {
  const out: Section[] = []
  blocks.forEach((block, index) => {
    if (block.data.kind !== 'heading') return
    const end = sectionEnd(blocks, index)
    const body = blocks.slice(index + 1, end + 1)
    const status: SectionStatus = body.length === 0 ? 'open' : 'done'
    out.push({ headingId: block.id, title: plainText(block.data.text), level: block.data.level, blockCount: body.length, status })
  })
  return out
}
