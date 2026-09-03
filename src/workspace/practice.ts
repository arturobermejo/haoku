import type { Citation, PracticeItem, PracticeProgress } from './types'

/** One question to practise, from the practice bank. */
export interface DeckItem {
  id: string
  prompt: string
  options: string[]
  answer: number
  explanation?: string
  citation?: Citation
  topic?: string
}

/** The deck: every question in the bank that has at least two options. */
export function buildDeck(bank: PracticeItem[]): DeckItem[] {
  // Items saved by an earlier build (cards without options) are skipped rather than shown broken.
  return bank.filter((it) => Array.isArray(it.options) && it.options.length >= 2).map((it) => ({ id: it.id, prompt: it.prompt, options: it.options, answer: it.answer, explanation: it.explanation, citation: it.citation, topic: it.topic }))
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
