/**
 * The reader's tool catalog: what an agent can do to the open document.
 * Inputs are phrased the way a person would say them — page numbers as
 * printed, passages as quotes — and every failure comes back as data.
 */
import { newId } from '../augment/ids'
import { unionRect } from '../augment/geometry'
import { anchorFromSelection } from '../augment/selection'
import type { AugmentationsApi } from '../augment/store'
import { anchorsOf, hasCard, type Anchor, type Augmentation, type DiagramEdge, type DiagramNode, type Kind } from '../augment/types'
import type { WorkspaceApi } from '../components/workspaceContext'
import type { PdfDoc } from '../pdf/types'
import { anchorForMatch, findInPage, type PageIndex } from './textIndex'

export interface ToolContext {
  doc: PdfDoc
  aug: AugmentationsApi
  ws: WorkspaceApi
  index: (page: number) => Promise<PageIndex>
}

export type ToolResult = { ok: true; summary: string; [key: string]: unknown } | { ok: false; error: string; hint?: string }

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

const HIGHLIGHT_KIND_VALUES: Kind[] = ['claim', 'definition', 'evidence', 'concept', 'question']

const pageParam = { type: 'integer', minimum: 1, description: 'Page number as printed in the reader, starting at 1.' }
const quoteParam = { type: 'string', description: 'A passage of the page, quoted from get_page_text. Whitespace, line breaks and hyphenation do not matter.' }
const occurrenceParam = { type: 'integer', minimum: 1, description: 'Which occurrence to use when the quote appears more than once on the page. Defaults to 1.' }

const fail = (error: string, hint?: string): ToolResult => ({ ok: false, error, ...(hint ? { hint } : {}) })

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key]
  return typeof v === 'string' && v.trim() ? v : undefined
}
function int(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key]
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined
}

function checkPage(ctx: ToolContext, page: number | undefined): ToolResult | number {
  if (page === undefined) return fail('"page" is required.', `Pages run from 1 to ${ctx.doc.pageCount}.`)
  if (page < 1 || page > ctx.doc.pageCount) return fail(`There is no page ${page}.`, `Pages run from 1 to ${ctx.doc.pageCount}.`)
  return page
}

/** Turns { page, quote, occurrence } into an anchor, or an explained failure. */
async function resolveQuote(ctx: ToolContext, input: Record<string, unknown>, quoteKey = 'quote'): Promise<ToolResult | Anchor> {
  const page = checkPage(ctx, int(input, 'page'))
  if (typeof page !== 'number') return page
  const quote = str(input, quoteKey)
  if (!quote) return fail(`"${quoteKey}" is required.`, 'Quote a passage of the page as returned by get_page_text.')
  const index = await ctx.index(page)
  const matches = findInPage(index, quote)
  if (matches.length === 0) return fail(`"${quote.slice(0, 60)}${quote.length > 60 ? '…' : ''}" does not appear on page ${page}.`, 'Copy the passage from get_page_text, or locate it with find_in_document.')
  const occurrence = int(input, 'occurrence') ?? 1
  if (occurrence > matches.length) return fail(`The quote appears ${matches.length} time(s) on page ${page}; there is no occurrence ${occurrence}.`)
  const anchor = anchorForMatch(index, matches[occurrence - 1])
  if (anchor.rects.length === 0) return fail('The passage has no printed position on the page.', 'It may be part of an image; choose a nearby line instead.')
  return anchor
}

function describe(item: Augmentation): Record<string, unknown> {
  const anchors = anchorsOf(item)
  const base = { id: item.id, type: item.type, pages: [...new Set(anchors.map((a) => a.page))], quote: anchors[0]?.text.slice(0, 120) }
  switch (item.type) {
    case 'highlight':
      return { ...base, kind: item.kind, note: item.note, card_shown: item.note !== undefined && !item.folded }
    case 'note':
      return { ...base, title: item.title, body: item.body, citations: item.anchors.length, card_shown: !item.folded }
    case 'rewrite':
      return { ...base, text: item.text, showing: item.showRewrite ? 'rewrite' : 'original' }
    case 'fold':
      return { id: item.id, type: item.type, pages: [item.page], collapsed: item.collapsed, height_pt: Math.round(item.y1 - item.y0) }
    case 'diagram':
      return { ...base, title: item.title, nodes: item.nodes.map((n) => ({ label: n.label, page: n.anchor.page })), card_shown: !item.folded }
    case 'flashcard':
      return { ...base, question: item.question, answer: item.answer, card_shown: !item.folded }
  }
}

export const TOOLS: ToolDef[] = [
  {
    name: 'get_reading_state',
    title: 'Where the reader is',
    description: 'Returns the open document, the page in view, the zoom, the text the user has selected, and how many augmentations exist.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async (_input, ctx) => {
      const selection = anchorFromSelection(window.getSelection(), ctx.ws.scale)
      const items = ctx.aug.getState().items
      const cards = items.filter(hasCard)
      return {
        ok: true,
        summary: `"${ctx.doc.title}", ${ctx.doc.pageCount} pages, page ${ctx.ws.currentPage} in view.`,
        title: ctx.doc.title,
        file_name: ctx.doc.fileName,
        page_count: ctx.doc.pageCount,
        current_page: ctx.ws.currentPage,
        zoom_percent: Math.round(ctx.ws.scale * 100),
        selection: selection.ok ? { page: selection.anchor.page, text: selection.anchor.text } : null,
        augmentations: { total: items.length, cards_shown: cards.filter((c) => !c.folded).length, cards_in_text: cards.filter((c) => c.folded).length },
      }
    },
  },
  {
    name: 'get_page_text',
    title: 'Read a page',
    description: 'Returns the full text of one page in reading order. Quote from it to anchor highlights, notes, rewrites, folds and flashcards.',
    inputSchema: { type: 'object', properties: { page: pageParam }, required: ['page'] },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, ctx) => {
      const page = checkPage(ctx, int(input, 'page'))
      if (typeof page !== 'number') return page
      const index = await ctx.index(page)
      return { ok: true, summary: `Page ${page}: ${index.text.length} characters.`, page, text: index.text }
    },
  },
  {
    name: 'find_in_document',
    title: 'Find a passage',
    description: 'Finds every occurrence of a phrase in the document, or on one page, with the page number and surrounding text.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words to look for; case, spacing and hyphenation are ignored.' }, page: { ...pageParam, description: 'Restrict the search to this page.' } },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, ctx) => {
      const query = str(input, 'query')
      if (!query) return fail('"query" is required.')
      const only = int(input, 'page')
      if (only !== undefined) {
        const check = checkPage(ctx, only)
        if (typeof check !== 'number') return check
      }
      const pages = only !== undefined ? [only] : Array.from({ length: ctx.doc.pageCount }, (_, i) => i + 1)
      const results: { page: number; occurrence: number; snippet: string }[] = []
      for (const page of pages) {
        const index = await ctx.index(page)
        findInPage(index, query).forEach((m, i) => {
          if (results.length >= 50) return
          const from = Math.max(0, m.start - 60)
          const to = Math.min(index.text.length, m.end + 60)
          results.push({ page, occurrence: i + 1, snippet: index.text.slice(from, to).replace(/\s+/g, ' ') })
        })
        if (results.length >= 50) break
      }
      return { ok: true, summary: results.length ? `${results.length} match(es) for "${query}".` : `"${query}" does not appear in the document.`, matches: results }
    },
  },
  {
    name: 'list_augmentations',
    title: 'List what is on the document',
    description: 'Lists the highlights, notes, rewrites, folds, diagrams and flashcards that exist, with their ids, pages and quoted passages.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { ...pageParam, description: 'Only augmentations anchored on this page.' },
        type: { type: 'string', enum: ['highlight', 'note', 'rewrite', 'fold', 'diagram', 'flashcard'] },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input, ctx) => {
      const page = int(input, 'page')
      const type = str(input, 'type')
      const items = ctx.aug.getState().items.filter((i) => (type ? i.type === type : true)).filter((i) => (page ? (i.type === 'fold' ? i.page === page : anchorsOf(i).some((a) => a.page === page)) : true))
      return { ok: true, summary: `${items.length} augmentation(s).`, augmentations: items.map(describe) }
    },
  },
  {
    name: 'highlight',
    title: 'Highlight a passage',
    description: 'Marks a quoted passage with a semantic colour. With a note, a card with that note appears next to the passage, tied to it by a thread.',
    inputSchema: {
      type: 'object',
      properties: {
        page: pageParam,
        quote: quoteParam,
        kind: { type: 'string', enum: HIGHLIGHT_KIND_VALUES, description: 'What the passage is. Defaults to "claim".' },
        note: { type: 'string', description: 'A short explanation to attach as a card.' },
        occurrence: occurrenceParam,
      },
      required: ['page', 'quote'],
    },
    execute: async (input, ctx) => {
      const anchor = await resolveQuote(ctx, input)
      if ('ok' in anchor) return anchor
      const kind = (str(input, 'kind') ?? 'claim') as Kind
      if (!HIGHLIGHT_KIND_VALUES.includes(kind)) return fail(`"${kind}" is not a highlight kind.`, `Valid kinds: ${HIGHLIGHT_KIND_VALUES.join(', ')}.`)
      const note = str(input, 'note')
      const item = ctx.aug.add({ type: 'highlight', kind, anchor, ...(note ? { note } : {}) })
      return { ok: true, summary: `Highlighted "${anchor.text.slice(0, 60)}…" on page ${anchor.page} as ${kind}${note ? ' with a note' : ''}.`, id: item.id }
    },
  },
  {
    name: 'create_note',
    title: 'Create a note citing passages',
    description: 'Creates a note card that cites one or more passages, possibly on different pages. Each citation is listed on the card and jumps back to its source.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string', description: 'The note itself.' },
        citations: { type: 'array', minItems: 1, items: { type: 'object', properties: { page: pageParam, quote: quoteParam, occurrence: occurrenceParam }, required: ['page', 'quote'] } },
      },
      required: ['body', 'citations'],
    },
    execute: async (input, ctx) => {
      const body = str(input, 'body')
      if (!body) return fail('"body" is required.')
      const citations = Array.isArray(input.citations) ? (input.citations as Record<string, unknown>[]) : []
      if (citations.length === 0) return fail('At least one citation is required.', 'Each citation is { page, quote }.')
      const anchors: Anchor[] = []
      for (const [n, c] of citations.entries()) {
        const anchor = await resolveQuote(ctx, c)
        if ('ok' in anchor) return { ...anchor, error: `Citation ${n + 1}: ${anchor.error}` }
        anchors.push(anchor)
      }
      const item = ctx.aug.add({ type: 'note', kind: 'synthesis', title: str(input, 'title') ?? '', body, anchors })
      return { ok: true, summary: `Note created citing ${anchors.length} passage(s) on page(s) ${[...new Set(anchors.map((a) => a.page))].join(', ')}.`, id: item.id }
    },
  },
  {
    name: 'rewrite_passage',
    title: 'Rewrite a passage in place',
    description: 'Replaces a quoted passage with new text set in the flow of the page; the page reflows around it. The original is kept and the user can flip back to it at any time.',
    inputSchema: { type: 'object', properties: { page: pageParam, quote: quoteParam, text: { type: 'string', description: 'The replacement text.' }, occurrence: occurrenceParam }, required: ['page', 'quote', 'text'] },
    execute: async (input, ctx) => {
      const anchor = await resolveQuote(ctx, input)
      if ('ok' in anchor) return anchor
      const text = str(input, 'text')
      if (!text) return fail('"text" is required.')
      const item = ctx.aug.add({ type: 'rewrite', anchor, text, showRewrite: true })
      return { ok: true, summary: `Rewrote "${anchor.text.slice(0, 60)}…" on page ${anchor.page}.`, id: item.id }
    },
  },
  {
    name: 'fold_section',
    title: 'Collapse a section',
    description: 'Collapses the vertical span of the page from one quoted passage to another (or the quoted passage alone) into a strip; the page shrinks. The user can expand it again.',
    inputSchema: {
      type: 'object',
      properties: { page: pageParam, quote: { ...quoteParam, description: 'Where the section starts (or the whole passage to fold).' }, end_quote: { ...quoteParam, description: 'Where the section ends, if different from the start.' }, occurrence: occurrenceParam },
      required: ['page', 'quote'],
    },
    execute: async (input, ctx) => {
      const start = await resolveQuote(ctx, input)
      if ('ok' in start) return start
      let y0 = unionRect(start.rects).y
      let y1 = y0 + unionRect(start.rects).h
      if (str(input, 'end_quote')) {
        const end = await resolveQuote(ctx, { ...input, occurrence: undefined }, 'end_quote')
        if ('ok' in end) return end
        const box = unionRect(end.rects)
        y1 = Math.max(y1, box.y + box.h)
        y0 = Math.min(y0, box.y)
      }
      const item = ctx.aug.add({ type: 'fold', page: start.page, y0: y0 - 2, y1: y1 + 2, collapsed: true })
      return { ok: true, summary: `Folded ${Math.round(y1 - y0)} pt of page ${start.page}.`, id: item.id }
    },
  },
  {
    name: 'create_flashcard',
    title: 'Create a flashcard',
    description: 'Creates a question/answer flashcard anchored to a quoted passage. The answer defaults to the passage itself.',
    inputSchema: { type: 'object', properties: { page: pageParam, quote: quoteParam, question: { type: 'string' }, answer: { type: 'string' }, occurrence: occurrenceParam }, required: ['page', 'quote', 'question'] },
    execute: async (input, ctx) => {
      const anchor = await resolveQuote(ctx, input)
      if ('ok' in anchor) return anchor
      const question = str(input, 'question')
      if (!question) return fail('"question" is required.')
      const item = ctx.aug.add({ type: 'flashcard', anchor, question, answer: str(input, 'answer') ?? anchor.text })
      return { ok: true, summary: `Flashcard created on page ${anchor.page}: "${question}".`, id: item.id }
    },
  },
  {
    name: 'create_diagram',
    title: 'Create a diagram of anchored nodes',
    description: 'Creates a diagram whose nodes each point at a quoted passage. Without edges the nodes form a chain in the order given.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        nodes: { type: 'array', minItems: 1, items: { type: 'object', properties: { label: { type: 'string' }, page: pageParam, quote: quoteParam, occurrence: occurrenceParam }, required: ['label', 'page', 'quote'] } },
        edges: {
          type: 'array',
          description: 'Optional. Refer to nodes by their 1-based position or by label.',
          items: { type: 'object', properties: { from: { type: ['integer', 'string'] }, to: { type: ['integer', 'string'] }, label: { type: 'string' } }, required: ['from', 'to'] },
        },
      },
      required: ['nodes'],
    },
    execute: async (input, ctx) => {
      const rawNodes = Array.isArray(input.nodes) ? (input.nodes as Record<string, unknown>[]) : []
      if (rawNodes.length === 0) return fail('At least one node is required.', 'Each node is { label, page, quote }.')
      const nodes: DiagramNode[] = []
      for (const [n, raw] of rawNodes.entries()) {
        const label = str(raw, 'label')
        if (!label) return fail(`Node ${n + 1} has no label.`)
        const anchor = await resolveQuote(ctx, raw)
        if ('ok' in anchor) return { ...anchor, error: `Node ${n + 1}: ${anchor.error}` }
        nodes.push({ id: newId('node'), label, anchor })
      }
      const ref = (v: unknown): DiagramNode | undefined => {
        if (typeof v === 'number') return nodes[v - 1]
        if (typeof v === 'string') return nodes.find((n) => n.label.toLowerCase() === v.toLowerCase())
        return undefined
      }
      let edges: DiagramEdge[]
      if (Array.isArray(input.edges) && input.edges.length > 0) {
        edges = []
        for (const [n, raw] of (input.edges as Record<string, unknown>[]).entries()) {
          const from = ref(raw.from)
          const to = ref(raw.to)
          if (!from || !to) return fail(`Edge ${n + 1} refers to a node that does not exist.`, `Nodes: ${nodes.map((x, i) => `${i + 1} "${x.label}"`).join(', ')}.`)
          edges.push({ from: from.id, to: to.id, ...(str(raw, 'label') ? { label: str(raw, 'label') } : {}) })
        }
      } else {
        edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }))
      }
      const item = ctx.aug.add({ type: 'diagram', title: str(input, 'title') ?? '', nodes, edges })
      return { ok: true, summary: `Diagram with ${nodes.length} node(s) and ${edges.length} edge(s) created.`, id: item.id }
    },
  },
  {
    name: 'edit_augmentation',
    title: 'Edit the text of an augmentation',
    description: 'Changes the text fields of an existing augmentation: the note of a highlight, the title or body of a note, the text of a rewrite, the question or answer of a flashcard, the title of a diagram.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, note: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, text: { type: 'string' }, question: { type: 'string' }, answer: { type: 'string' } },
      required: ['id'],
    },
    execute: async (input, ctx) => {
      const id = str(input, 'id')
      const item = id ? ctx.aug.byId(id) : undefined
      if (!item) return fail(`There is no augmentation "${id ?? ''}".`, 'Ids come from list_augmentations.')
      const fields = ['note', 'title', 'body', 'text', 'question', 'answer'].filter((k) => typeof input[k] === 'string')
      const applicable: Record<Augmentation['type'], string[]> = { highlight: ['note'], note: ['title', 'body'], rewrite: ['text'], flashcard: ['question', 'answer'], diagram: ['title'], fold: [] }
      const applied = fields.filter((k) => applicable[item.type].includes(k))
      if (applied.length === 0) return fail(`Nothing to change on a ${item.type}.`, `A ${item.type} accepts: ${applicable[item.type].join(', ') || 'no text fields'}.`)
      ctx.aug.update(item.id, (i) => ({ ...i, ...Object.fromEntries(applied.map((k) => [k, input[k]])) }) as Augmentation)
      return { ok: true, summary: `Updated ${applied.join(', ')} of ${item.type} ${item.id}.`, id: item.id }
    },
  },
  {
    name: 'modify_augmentation',
    title: 'Change the state of an augmentation',
    description: 'Removes an augmentation, shows or hides its card, collapses or expands a fold, or flips a rewrite between the rewritten and original text.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, action: { type: 'string', enum: ['remove', 'show_card', 'hide_card', 'collapse', 'expand', 'show_rewrite', 'show_original'] } },
      required: ['id', 'action'],
    },
    execute: async (input, ctx) => {
      const id = str(input, 'id')
      const item = id ? ctx.aug.byId(id) : undefined
      if (!item) return fail(`There is no augmentation "${id ?? ''}".`, 'Ids come from list_augmentations.')
      const action = str(input, 'action')
      switch (action) {
        case 'remove':
          ctx.aug.remove(item.id)
          return { ok: true, summary: `Removed ${item.type} ${item.id}.` }
        case 'show_card':
        case 'hide_card': {
          if (!hasCard(item)) return fail(`A ${item.type} has no card.`)
          const wantFolded = action === 'hide_card'
          ctx.aug.setFolded(item.id, wantFolded)
          return { ok: true, summary: `${wantFolded ? 'Hid' : 'Showed'} the card of ${item.id}.` }
        }
        case 'collapse':
        case 'expand': {
          if (item.type !== 'fold') return fail(`Only folds collapse; ${item.id} is a ${item.type}.`)
          const want = action === 'collapse'
          ctx.aug.setCollapsed(item.id, want)
          return { ok: true, summary: `${want ? 'Collapsed' : 'Expanded'} the fold on page ${item.page}.` }
        }
        case 'show_rewrite':
        case 'show_original': {
          if (item.type !== 'rewrite') return fail(`Only rewrites flip; ${item.id} is a ${item.type}.`)
          const want = action === 'show_rewrite'
          ctx.aug.setShowRewrite(item.id, want)
          return { ok: true, summary: `Now showing the ${want ? 'rewrite' : 'original'} on page ${item.anchor.page}.` }
        }
        default:
          return fail(`"${action ?? ''}" is not an action.`, 'Valid actions: remove, show_card, hide_card, collapse, expand, show_rewrite, show_original.')
      }
    },
  },
  {
    name: 'go_to',
    title: 'Bring the reader to a place',
    description: 'Scrolls the reader to a page, to a quoted passage on it, or to an existing augmentation, and flashes a halo there.',
    inputSchema: {
      type: 'object',
      properties: { page: pageParam, quote: quoteParam, occurrence: occurrenceParam, augmentation_id: { type: 'string' } },
    },
    execute: async (input, ctx) => {
      const id = str(input, 'augmentation_id')
      if (id) {
        const item = ctx.aug.byId(id)
        if (!item) return fail(`There is no augmentation "${id}".`)
        const anchor = anchorsOf(item)[0]
        if (anchor) ctx.ws.jumpTo(anchor)
        else if (item.type === 'fold') ctx.ws.scrollToPage(item.page, item.y0)
        ctx.aug.select(item.id)
        return { ok: true, summary: `Jumped to ${item.type} ${item.id}.` }
      }
      if (str(input, 'quote')) {
        const anchor = await resolveQuote(ctx, input)
        if ('ok' in anchor) return anchor
        ctx.ws.jumpTo(anchor)
        return { ok: true, summary: `Jumped to "${anchor.text.slice(0, 60)}" on page ${anchor.page}.` }
      }
      const page = checkPage(ctx, int(input, 'page'))
      if (typeof page !== 'number') return fail('Give a page, a quote or an augmentation_id.')
      ctx.ws.scrollToPage(page, 0)
      return { ok: true, summary: `Scrolled to page ${page}.` }
    },
  },
]

/** Runs one tool by name; unknown names and thrown errors come back as data. */
export async function runTool(name: string, input: unknown, ctx: ToolContext | null): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return fail(`There is no tool "${name}".`, `Tools: ${TOOLS.map((t) => t.name).join(', ')}.`)
  if (!ctx) return fail('No document is open.', 'Open a PDF in the reader first.')
  try {
    const args = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
    return await tool.execute(args, ctx)
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : String(err), `Tool: ${name}.`)
  }
}
