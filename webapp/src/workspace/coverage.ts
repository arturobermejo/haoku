import { plainText } from './markdown/excerpt'
import type { ParsedBlock } from './markdown/types'
import { sectionEnd } from './position'

export type SectionStatus = 'done' | 'shaky' | 'open'

export interface Section {
  headingId: string
  title: string
  level: number
  blockCount: number
  status: SectionStatus
}

export const answerKey = (blockId: string, questionIndex: number) => `${blockId}:${questionIndex}`

/**
 * "What you've covered": one row per heading. A section with no blocks is
 * open; one with a quiz answered wrong is shaky; otherwise it is done.
 */
export function sections(blocks: ParsedBlock[], quizAnswers: Record<string, number>): Section[] {
  const out: Section[] = []
  blocks.forEach((block, index) => {
    if (block.data.kind !== 'heading') return
    const end = sectionEnd(blocks, index)
    const body = blocks.slice(index + 1, end + 1)
    let status: SectionStatus = body.length === 0 ? 'open' : 'done'
    for (const b of body) {
      if (b.data.kind !== 'quiz') continue
      b.data.questions.forEach((q, i) => {
        const picked = quizAnswers[answerKey(b.id, i)]
        if (picked !== undefined && picked !== q.answer) status = 'shaky'
      })
    }
    out.push({ headingId: block.id, title: plainText(block.data.text), level: block.data.level, blockCount: body.length, status })
  })
  return out
}
