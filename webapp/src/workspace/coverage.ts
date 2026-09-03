import { sectionEnd } from './position'
import type { Block } from './types'

export type SectionStatus = 'done' | 'shaky' | 'open'

export interface Section {
  headingId: string
  title: string
  level: number
  blockCount: number
  status: SectionStatus
}

/**
 * "What you've covered": one row per heading. A section with no blocks is
 * open; one with a quiz answered wrong is shaky; otherwise it is done.
 */
export function sections(blocks: Block[], quizAnswers: Record<string, number>): Section[] {
  const out: Section[] = []
  blocks.forEach((block, index) => {
    if (block.content.type !== 'heading') return
    const end = sectionEnd(blocks, index)
    const body = blocks.slice(index + 1, end + 1)
    let status: SectionStatus = body.length === 0 ? 'open' : 'done'
    for (const b of body) {
      if (b.content.type !== 'quiz') continue
      for (const q of b.content.questions) {
        const picked = quizAnswers[q.id]
        if (picked !== undefined && picked !== q.answer) status = 'shaky'
      }
    }
    out.push({ headingId: block.id, title: block.content.text, level: block.content.level, blockCount: body.length, status })
  })
  return out
}
