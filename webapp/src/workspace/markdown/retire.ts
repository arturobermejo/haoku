import { newId } from '../ids'
import type { Citation, PracticeItem, WorkspaceDoc } from '../types'
import { citationKeysIn } from './citations'
import { plainText } from './excerpt'
import { parseDocument } from './parse'

/**
 * Questions and cards no longer live in the document: the study sheet holds prose, tables, callouts,
 * diagrams and images, and multiple-choice questions live in the practice bank. A space saved by an
 * earlier build can still carry `<space-quiz>` / `<space-flashcards>` blocks, so on load and on import
 * every quiz question moves to the bank and every flashcard becomes a paragraph, keeping its citation.
 */

type NewQuestion = Omit<PracticeItem, 'id' | 'createdAt'>

export interface Retired {
  markdown: string
  questions: NewQuestion[]
  /** How many blocks were rewritten; 0 means the document had none. */
  rewritten: number
}

const BLOCK = /^<space-(quiz|flashcards)\b([^>]*)>\n([\s\S]*?)\n<\/space-\1>[^\S\n]*$/gm
const HEADING = /^(#{1,3})\s+(.*)$/

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const field = (v: unknown, key: string): unknown => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
/** The text as it should read outside the document: citation marks belong to the footnotes, not the bank. */
const clean = (v: unknown): string =>
  text(v)
    .replace(/\s*\[\^\w+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** The last heading above `at`, as the topic of the questions found there. */
function topicAt(markdown: string, at: number): string | undefined {
  let topic = ''
  for (const line of markdown.slice(0, at).split('\n')) {
    const h = HEADING.exec(line)
    if (h) topic = plainText(h[2])
  }
  return topic || undefined
}

export function retireStudyQuestions(markdown: string): Retired {
  if (!/<space-(quiz|flashcards)\b/.test(markdown)) return { markdown, questions: [], rewritten: 0 }
  const { footnotes } = parseDocument(markdown)
  const questions: NewQuestion[] = []
  let rewritten = 0

  const out = markdown.replace(BLOCK, (raw: string, kind: string, attrs: string, body: string, at: number) => {
    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      // Unreadable JSON: leave the block alone rather than drop text nobody can recover.
      return raw
    }
    rewritten++
    const blockKeys = /\bcites="([^"]*)"/.exec(attrs)?.[1].split(/\s+/).filter(Boolean) ?? []
    const citation = (...keys: string[]): Citation | undefined => {
      for (const key of [...keys, ...blockKeys]) {
        const c = footnotes.get(key)
        if (c) return c
      }
      return undefined
    }

    if (kind === 'quiz') {
      const topic = topicAt(markdown, at)
      for (const q of asArray(field(json, 'questions'))) {
        const prompt = clean(field(q, 'prompt'))
        const options = asArray(field(q, 'options')).map(clean)
        if (!prompt || options.length < 2) continue
        const raw_answer = Number(field(q, 'answer'))
        const answer = Number.isFinite(raw_answer) && raw_answer >= 0 && raw_answer < options.length ? Math.trunc(raw_answer) : 0
        const explanation = clean(field(q, 'explanation'))
        const keys = citationKeysIn([text(field(q, 'prompt')), text(field(q, 'explanation'))].join(' '))
        questions.push({ prompt, options, answer, ...(explanation ? { explanation } : {}), ...(citation(...keys) ? { citation: citation(...keys) } : {}), ...(topic ? { topic } : {}), by: 'user' })
      }
      return ''
    }

    // A flashcard is prose in disguise: keep the pair as a paragraph, with the card's own mark if it had one.
    return asArray(field(json, 'cards'))
      .map((card) => {
        const question = text(field(card, 'question')).replace(/\s+/g, ' ').trim()
        const answer = text(field(card, 'answer')).replace(/\s+/g, ' ').trim()
        const cite = text(field(card, 'cite'))
        const mark = cite && footnotes.has(cite) ? ` [^${cite}]` : ''
        if (!question && !answer) return ''
        return `${question ? `**${question}** ` : ''}${answer}${mark}`.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  })

  return { markdown: out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '\n'), questions, rewritten }
}

/** The stored document with its questions moved to the practice bank. Unchanged when it has none. */
export function retireDoc(doc: WorkspaceDoc): WorkspaceDoc {
  const { markdown, questions, rewritten } = retireStudyQuestions(doc.markdown)
  if (rewritten === 0) return doc
  const now = Date.now()
  const moved: PracticeItem[] = questions.map((q) => ({ ...q, id: newId('p'), createdAt: now }))
  // The blocks shifted, so ids are minted afresh; the practice bank keeps the questions.
  return { ...doc, markdown, blockIds: [], practice: [...(doc.practice ?? []), ...moved] }
}
