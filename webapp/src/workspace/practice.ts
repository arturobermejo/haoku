import type { ParsedBlock } from './markdown/types'
import type { Citation, PracticeItem, PracticeProgress } from './types'

/** One question to practise: a bank item or a question lifted from a quiz in the document. */
export interface DeckItem {
  id: string
  prompt: string
  options: string[]
  answer: number
  explanation?: string
  citation?: Citation
  topic?: string
  origin: 'bank' | 'space'
}

/** Questions from the document's quizzes, keyed so progress survives edits elsewhere. */
export function deckFromBlocks(blocks: ParsedBlock[], footnotes: Map<string, Citation>): DeckItem[] {
  const out: DeckItem[] = []
  let topic: string | undefined
  for (const b of blocks) {
    if (b.data.kind === 'heading') topic = b.data.text.replace(/\[\^\w+\]/g, '').trim()
    if (b.data.kind !== 'quiz') continue
    const first = b.citationKeys[0]
    const blockCite = first ? footnotes.get(first) : undefined
    b.data.questions.forEach((q, i) => out.push({ id: `${b.id}:q${i}`, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation, citation: blockCite, topic, origin: 'space' }))
  }
  return out
}

export function deckFromBank(items: PracticeItem[]): DeckItem[] {
  // Items saved by an earlier build (cards without options) are skipped rather than shown broken.
  return items.filter((it) => Array.isArray(it.options) && it.options.length >= 2).map((it) => ({ id: it.id, prompt: it.prompt, options: it.options, answer: it.answer, explanation: it.explanation, citation: it.citation, topic: it.topic, origin: 'bank' }))
}

export function buildDeck(blocks: ParsedBlock[], footnotes: Map<string, Citation>, bank: PracticeItem[]): DeckItem[] {
  return [...deckFromBank(bank), ...deckFromBlocks(blocks, footnotes)]
}

/** Questions the learner got wrong more often than right, or never saw, first. */
export function orderForPractice(deck: DeckItem[], progress: Record<string, PracticeProgress>, shuffle = true): DeckItem[] {
  const score = (it: DeckItem) => {
    const p = progress[it.id]
    if (!p) return 0
    return p.right - p.wrong
  }
  const list = [...deck]
  if (shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  }
  return list.sort((a, b) => score(a) - score(b))
}

export function progressSummary(deck: DeckItem[], progress: Record<string, PracticeProgress>) {
  let seen = 0
  let mastered = 0
  let struggling = 0
  for (const it of deck) {
    const p = progress[it.id]
    if (!p || p.seen === 0) continue
    seen++
    if (p.right > p.wrong) mastered++
    else if (p.wrong > 0) struggling++
  }
  return { total: deck.length, seen, mastered, struggling, unseen: deck.length - seen }
}
