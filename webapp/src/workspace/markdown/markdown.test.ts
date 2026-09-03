import { describe, expect, it } from 'vitest'
import { citationKeysIn, footnoteLine, parseFootnote, rewriteKeys, withCiteMarks, withoutCiteMark } from './citations'
import { blockExcerpt } from './excerpt'
import { legacyToMarkdown, type LegacyDoc } from './legacy'
import { parseBlock, parseDocument } from './parse'
import { reconcileIds } from './reconcile'
import { blockToMarkdown, serializeDocument } from './serialize'
import type { BlockData } from './types'

const DOC = `## Why a context window is not memory

Every call to a language model starts from nothing [^1], so an agent needs
something **outside** the window [^2].

<space-callout tone="warning" title="Memory &quot;poisoning&quot;" cites="5">
Anything that comes back from a tool is untrusted.
</space-callout>

**Four kinds of memory** [^2]
| | holds | in an agent |
|---|---|---|
| Working | the current task | the context window |
| Episodic | time-stamped events | event store \\| log |

![Whiteboard sketch. [^5]](space://s_img)

<space-diagram title="Write / read">
{"nodes":[{"label":"Event"},{"label":"Summarise","cite":"1"},{"label":"Store"}],
 "edges":[{"from":0,"to":1,"label":"write"},{"from":1,"to":2}]}
</space-diagram>

<space-flashcards>
{"cards":[{"question":"Consolidation","answer":"Distils episodes into facts. [^2]","cite":"1"}]}
</space-flashcards>

<space-quiz cites="1">
{"questions":[{"prompt":"Which store has a when attached?","options":["Semantic","Episodic"],"answer":1,"explanation":"Episodes are time-stamped."}]}
</space-quiz>

- a list stays free markdown
- and is one block

\`\`\`js
const blank = 1

still the same block
\`\`\`

[^1]: [lecture.pdf, p. 1](space://s_lec/1) — "Every call to a language model starts from nothing"
[^2]: [paper.pdf, p. 1](space://s_pap/1#2) — "the context window is the only state they carry"
[^5]: [notes.md](space://s_notes/1)
`

describe('parseDocument', () => {
  const doc = parseDocument(DOC)

  it('splits into typed blocks and keeps footnotes apart', () => {
    expect(doc.blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'callout', 'comparison', 'image', 'diagram', 'flashcards', 'quiz', 'paragraph', 'paragraph'])
    expect([...doc.footnotes.keys()]).toEqual(['1', '2', '5'])
    expect(doc.footnotes.get('2')).toEqual({ sourceId: 's_pap', page: 1, occurrence: 2, quote: 'the context window is the only state they carry' })
    expect(doc.footnotes.get('5')).toEqual({ sourceId: 's_notes', page: 1 })
  })

  it('reads element attributes, JSON and citation keys', () => {
    const [, para, callout, table, image, diagram, cards, quiz] = doc.blocks
    expect(para.citationKeys).toEqual(['1', '2'])
    expect(callout.data).toEqual({ kind: 'callout', tone: 'warning', title: 'Memory "poisoning"', body: 'Anything that comes back from a tool is untrusted.', cites: ['5'] })
    expect(callout.citationKeys).toEqual(['5'])
    expect(table.data).toEqual({ kind: 'comparison', title: 'Four kinds of memory [^2]', columns: ['holds', 'in an agent'], rows: [{ label: 'Working', cells: ['the current task', 'the context window'] }, { label: 'Episodic', cells: ['time-stamped events', 'event store | log'] }] })
    expect(table.citationKeys).toEqual(['2'])
    expect(image.data).toEqual({ kind: 'image', sourceId: 's_img', caption: 'Whiteboard sketch. [^5]' })
    expect(image.citationKeys).toEqual(['5'])
    expect(diagram.data).toMatchObject({ kind: 'diagram', title: 'Write / read', nodes: [{ label: 'Event' }, { label: 'Summarise', cite: '1' }, { label: 'Store' }], edges: [{ from: 0, to: 1, label: 'write' }, { from: 1, to: 2 }] })
    expect(diagram.citationKeys).toEqual(['1'])
    expect(cards.citationKeys).toEqual(['1', '2'])
    expect(quiz.data).toMatchObject({ kind: 'quiz', cites: ['1'], questions: [{ answer: 1, options: ['Semantic', 'Episodic'] }] })
  })

  it('keeps fenced code with blank lines as one block and falls back to paragraph on bad JSON', () => {
    expect(doc.blocks[9].raw).toContain('still the same block')
    const bad = parseBlock('<space-quiz>\n{not json\n</space-quiz>')
    expect(bad?.kind).toBe('paragraph')
    expect(bad?.raw).toContain('<space-quiz>')
  })

  it('extracts a leading level-1 heading as the title only when asked', () => {
    expect(parseDocument('# Title\n\nText').blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph'])
    const ex = parseDocument('# Title\n\nText', { extractTitle: true })
    expect(ex.title).toBe('Title')
    expect(ex.blocks.map((b) => b.kind)).toEqual(['paragraph'])
  })

  it('parseBlock refuses several blocks', () => {
    expect(parseBlock('one\n\ntwo')).toBeNull()
    expect(parseBlock('## just one')?.kind).toBe('heading')
  })

  it('handles CRLF', () => {
    expect(parseDocument('## a\r\n\r\ntext\r\n').blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph'])
  })
})

describe('round trip', () => {
  it('serialises back to the same document (canonical form)', () => {
    const doc = parseDocument(DOC)
    const md = serializeDocument(doc.blocks, doc.footnotes, { sourceName: (id) => ({ s_lec: 'lecture.pdf', s_pap: 'paper.pdf', s_notes: 'notes.md' })[id] ?? id })
    const again = parseDocument(md)
    expect(again.blocks.map((b) => b.raw)).toEqual(doc.blocks.map((b) => b.raw))
    expect([...again.footnotes]).toEqual([...doc.footnotes])
    expect(serializeDocument(again.blocks, again.footnotes)).toBe(serializeDocument(doc.blocks, doc.footnotes))
  })

  it('every block kind survives blockToMarkdown → parse', () => {
    const datas: BlockData[] = [
      { kind: 'heading', text: 'Title [^1]', level: 3 },
      { kind: 'paragraph', markdown: 'Some *text*\nwith two lines' },
      { kind: 'callout', tone: 'why', title: 'a "quoted" <title>', body: 'body & more', cites: ['1', '2'] },
      { kind: 'diagram', title: 'd', nodes: [{ label: 'a "q"' }, { label: 'b', cite: '2' }], edges: [{ from: 0, to: 1, label: '<x>' }], cites: [] },
      { kind: 'comparison', title: '', columns: ['x', 'y'], rows: [{ label: 'r', cells: ['1 | 2', ''] }] },
      { kind: 'flashcards', cards: [{ question: 'q', answer: 'a\nb', cite: '1' }], cites: ['3'] },
      { kind: 'quiz', questions: [{ prompt: 'p', options: ['a', 'b', 'c'], answer: 2 }], cites: [] },
      { kind: 'image', sourceId: 's_x', caption: 'cap' },
    ]
    for (const data of datas) {
      const block = parseBlock(blockToMarkdown(data))
      expect(block, blockToMarkdown(data)).not.toBeNull()
      expect(block!.data).toEqual(data)
    }
  })

  it('renumbers footnotes by first use on export and drops unused ones', () => {
    const doc = parseDocument('A [^7] and [^3]\n\n<space-quiz cites="3">\n{"questions":[]}\n</space-quiz>\n\n[^3]: [a](space://s_a/1)\n[^7]: [b](space://s_b/2)\n[^9]: [c](space://s_c)\n')
    const md = serializeDocument(doc.blocks, doc.footnotes, { renumber: true, title: 'T' })
    expect(md).toBe('# T\n\nA [^1] and [^2]\n\n<space-quiz cites="2">\n{"questions":[]}\n</space-quiz>\n\n[^1]: [s_b, p. 2](space://s_b/2)\n[^2]: [s_a, p. 1](space://s_a/1)\n')
  })
})

describe('citations', () => {
  it('parses and writes footnote lines', () => {
    const c = { sourceId: 's_1', page: 3, occurrence: 2, quote: 'say "hi"' }
    const line = footnoteLine('4', c, 'file.pdf')
    expect(line).toBe('[^4]: [file.pdf, p. 3](space://s_1/3#2) — "say \\"hi\\""')
    expect(parseFootnote(line)).toEqual({ key: '4', citation: c })
    expect(parseFootnote('[^x]: [img.png](space://s_9)')).toEqual({ key: 'x', citation: { sourceId: 's_9' } })
    expect(parseFootnote('[^1]: plain note')).toBeNull()
  })

  it('adds marks in the natural place per kind', () => {
    expect(withCiteMarks('heading', '## Title', ['1'])).toBe('## Title [^1]')
    expect(withCiteMarks('paragraph', 'text [^1]', ['1', '2'])).toBe('text [^1] [^2]')
    expect(withCiteMarks('image', '![cap](space://s)', ['1'])).toBe('![cap [^1]](space://s)')
    expect(withCiteMarks('comparison', '| | a |\n|---|---|\n| r | 1 |', ['1'])).toBe('[^1]\n| | a |\n|---|---|\n| r | 1 |')
    expect(withCiteMarks('comparison', '**T**\n| | a |\n|---|---|', ['1'])).toBe('**T** [^1]\n| | a |\n|---|---|')
    expect(withCiteMarks('quiz', '<space-quiz>\n{}\n</space-quiz>', ['1', '2'])).toBe('<space-quiz cites="1 2">\n{}\n</space-quiz>')
    expect(withCiteMarks('callout', '<space-callout tone="idea" cites="1">\nb\n</space-callout>', ['1', '3'])).toBe('<space-callout tone="idea" cites="1 3">\nb\n</space-callout>')
  })

  it('removes and rewrites keys everywhere', () => {
    const raw = '<space-flashcards cites="1 2">\n{"cards":[{"question":"q [^1]","answer":"a","cite":"2"}]}\n</space-flashcards>'
    expect(withoutCiteMark(raw, '2')).toBe('<space-flashcards cites="1">\n{"cards":[{"question":"q [^1]","answer":"a"}]}\n</space-flashcards>')
    expect(rewriteKeys(raw, new Map([['1', '9'], ['2', '1']]))).toBe('<space-flashcards cites="9 1">\n{"cards":[{"question":"q [^9]","answer":"a","cite":"1"}]}\n</space-flashcards>')
    expect(citationKeysIn('x [^2] y [^2] [^a1]')).toEqual(['2', 'a1'])
  })
})

describe('reconcileIds', () => {
  const prev = parseDocument('## A\n\nB\n\nC').blocks
  it('keeps ids for unchanged blocks and the edited one by position', () => {
    const next = reconcileIds(prev, parseDocument('## A\n\nB edited\n\nC').blocks)
    expect(next.map((b) => b.id)).toEqual(prev.map((b) => b.id))
  })
  it('does not steal ids on insert, keeps them on delete and move', () => {
    const inserted = reconcileIds(prev, parseDocument('## A\n\nNEW\n\nB\n\nC').blocks)
    expect([inserted[0].id, inserted[2].id, inserted[3].id]).toEqual([prev[0].id, prev[1].id, prev[2].id])
    expect(prev.map((b) => b.id)).not.toContain(inserted[1].id)
    const deleted = reconcileIds(prev, parseDocument('## A\n\nC').blocks)
    expect(deleted.map((b) => b.id)).toEqual([prev[0].id, prev[2].id])
    const moved = reconcileIds(prev, parseDocument('C\n\n## A\n\nB').blocks)
    expect(moved.map((b) => b.id)).toEqual([prev[2].id, prev[0].id, prev[1].id])
  })
})

describe('legacy migration', () => {
  it('converts the old block model with shared citations', () => {
    const cite = { sourceId: 's_a', page: 2, quote: 'q' }
    const doc: LegacyDoc = {
      title: 'T',
      blocks: [
        { id: 'b1', content: { type: 'heading', text: 'H', level: 1 }, citations: [] },
        { id: 'b2', content: { type: 'paragraph', text: 'one [1] two [2]' }, citations: [cite, { sourceId: 's_b' }] },
        { id: 'b3', content: { type: 'diagram', title: 'D', nodes: [{ id: 'n1', label: 'x', citation: cite }, { id: 'n2', label: 'y' }], edges: [{ from: 'n1', to: 'n2', label: 'e' }] }, citations: [] },
        { id: 'b4', content: { type: 'quiz', questions: [{ id: 'q1', prompt: 'p', options: ['a', 'b'], answer: 1 }] }, citations: [{ sourceId: 's_b' }] },
        { id: 'b5', content: { type: 'image', sourceId: 's_img', caption: 'c' }, citations: [] },
      ],
    }
    const md = legacyToMarkdown(doc, (id) => `${id}.pdf`)
    const parsed = parseDocument(md)
    expect(parsed.blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'diagram', 'quiz', 'image'])
    expect(parsed.blocks[1].raw).toBe('one [^1] two [^2]')
    expect(parsed.blocks[2].data).toMatchObject({ nodes: [{ label: 'x', cite: '1' }, { label: 'y' }], edges: [{ from: 0, to: 1, label: 'e' }] })
    expect(parsed.blocks[3].citationKeys).toEqual(['2'])
    expect([...parsed.footnotes.keys()]).toEqual(['1', '2'])
    expect(md).toContain('[^1]: [s_a.pdf, p. 2](space://s_a/2) — "q"')
  })
})

describe('excerpt', () => {
  it('strips markdown and marks', () => {
    const b = parseBlock('Some **bold** [^1] and [a link](http://x)')!
    expect(blockExcerpt(b)).toBe('Some bold and a link')
  })
})
