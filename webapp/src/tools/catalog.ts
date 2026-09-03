/**
 * The workspace's tool catalog: what an agent can do to the sources and the
 * knowledge space. Inputs are phrased the way a person would say them —
 * sources by name or id, pages as printed, passages as quotes — and every
 * failure comes back as data.
 *
 * The document is Markdown: blocks are its top-level chunks, interactive ones are
 * `<space-*>` elements, citations are footnotes `[^k]`. Tools speak in typed content
 * (validated here) or in raw markdown.
 */
import { sections } from '../workspace/coverage'
import { BLOCK_KINDS, blockExcerpt, blockToMarkdown, CALLOUT_TONES, citationKeysIn, parseDocument, withCiteMarks, withoutCiteMark, type BlockData, type CalloutTone, type ParsedBlock } from '../workspace/markdown'
import { insertIndex } from '../workspace/position'
import type { SourcesApi } from '../workspace/sources'
import type { WorkspaceApi } from '../workspace/store'
import { HIGHLIGHT_KINDS, type Citation, type HighlightKind, type Position, type Source } from '../workspace/types'

export interface ToolContext {
  ws: WorkspaceApi
  sources: SourcesApi
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

type Obj = Record<string, unknown>
const fail = (error: string, hint?: string): ToolResult => ({ ok: false, error, ...(hint ? { hint } : {}) })
const str = (o: Obj, k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : undefined)
const int = (o: Obj, k: string) => (typeof o[k] === 'number' && Number.isInteger(o[k]) ? (o[k] as number) : undefined)
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined)
const arr = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined)
const isFail = (v: unknown): v is ToolResult => !!v && typeof v === 'object' && 'ok' in (v as object)

const sourceParam = { type: 'string', description: 'A source by id (from list_sources) or by file name.' }
const pageParam = { type: 'integer', minimum: 1, description: 'Page number as printed, starting at 1. Text sources are a single page.' }
const quoteParam = { type: 'string', description: 'A passage of the source, quoted from read_source or search_sources. Spacing, line breaks and hyphenation do not matter.' }
const citationSchema = {
  type: 'object',
  properties: { source: sourceParam, page: pageParam, quote: quoteParam, occurrence: { type: 'integer', minimum: 1, description: 'Which occurrence when the quote repeats on the page. Defaults to 1.' } },
  required: ['source'],
  description: 'Where a piece of content comes from. Give page and quote for PDFs and text; an image is cited by source alone.',
}
const positionSchema = {
  description: 'Where the block goes: "end" (default), "start", { "after": block_id }, { "before": block_id } or { "in_section": heading_block_id } for the end of that section.',
  oneOf: [
    { type: 'string', enum: ['end', 'start'] },
    { type: 'object', properties: { after: { type: 'string' } }, required: ['after'] },
    { type: 'object', properties: { before: { type: 'string' } }, required: ['before'] },
    { type: 'object', properties: { in_section: { type: 'string' } }, required: ['in_section'] },
  ],
}

const CONTENT_SHAPES: Record<BlockData['kind'], string> = {
  heading: '{ text, level?: 1|2|3 (default 2) }',
  paragraph: '{ text } — markdown; write [1], [2]… in the text to mark where each citation applies (they become footnotes)',
  callout: '{ title?, body (markdown), tone?: "idea"|"example"|"warning"|"why" (default "idea") }',
  diagram: '{ title?, nodes: [{ label, citation? }], edges?: [{ from, to, label? }] } — any graph: from/to by 1-based node position or label, branches and cycles allowed, laid out automatically; without edges the nodes form a chain',
  comparison: '{ title?, columns: [string], rows: [{ label, cells: [string] }] }',
  flashcards: '{ cards: [{ question, answer, citation? }] }',
  quiz: '{ questions: [{ prompt, options: [string], answer: 1-based position or the option text, explanation? }] }',
  image: '{ source: an image source (id or name), caption? }',
}

const MARKDOWN_HELP =
  'Block markdown: `## heading`, free markdown paragraphs, a GFM table (first column = row labels, optional **title** line above), `![caption](space://<source_id>)`, or an element: <space-callout tone="…" title="…">body</space-callout>, <space-diagram title="…">{"nodes":[{"label"}],"edges":[{"from":0,"to":1}]}</space-diagram>, <space-flashcards>{"cards":[{"question","answer"}]}</space-flashcards>, <space-quiz>{"questions":[{"prompt","options":[…],"answer":0}]}</space-quiz>. Cite with [^k] marks (keys from get_workspace) or list citations and use [1], [2]….'

function sourceOf(ctx: ToolContext, ref: string | undefined): Source | ToolResult {
  if (!ref) return fail('"source" is required.', 'Use an id or a file name from list_sources.')
  const s = ctx.sources.byRef(ref)
  if (!s) return fail(`There is no source "${ref}".`, `Sources: ${ctx.sources.sources.map((x) => `${x.id} (${x.name})`).join(', ') || 'none — the user has to add some'}.`)
  return s
}

/** Validates a citation against the sources; finds the page when a PDF quote comes without one. */
async function resolveCitation(ctx: ToolContext, raw: unknown, label = 'citation'): Promise<Citation | ToolResult> {
  const c = obj(raw)
  if (!c) return fail(`${label} must be an object { source, page?, quote? }.`)
  const source = sourceOf(ctx, str(c, 'source') ?? str(c, 'source_id'))
  if (isFail(source)) return fail(`${label}: ${(source as { error: string }).error}`, (source as { hint?: string }).hint)
  const quote = str(c, 'quote')
  const occurrence = int(c, 'occurrence') ?? 1
  if (source.kind === 'image') return { sourceId: source.id }
  if (!quote) return int(c, 'page') ? { sourceId: source.id, page: int(c, 'page') } : { sourceId: source.id }
  const pages = int(c, 'page') ? [int(c, 'page')!] : Array.from({ length: ctx.sources.pageCount(source.id) }, (_, i) => i + 1)
  if (pages[0] > ctx.sources.pageCount(source.id)) return fail(`${label}: ${source.name} has ${ctx.sources.pageCount(source.id)} page(s); there is no page ${pages[0]}.`)
  for (const page of pages) {
    const hit = await ctx.sources.resolve({ sourceId: source.id, page, quote, occurrence })
    if (hit) return { sourceId: source.id, page, quote: hit.text, ...(occurrence > 1 ? { occurrence } : {}) }
  }
  return fail(`${label}: "${quote.slice(0, 60)}${quote.length > 60 ? '…' : ''}" does not appear in ${source.name}${int(c, 'page') ? ` on page ${int(c, 'page')}` : ''}.`, 'Copy the passage from read_source, or find it with search_sources.')
}

async function resolveCitations(ctx: ToolContext, raw: unknown): Promise<Citation[] | ToolResult> {
  const list = arr(raw) ?? []
  const out: Citation[] = []
  for (const [i, item] of list.entries()) {
    const c = await resolveCitation(ctx, item, `citation ${i + 1}`)
    if (isFail(c)) return c
    out.push(c)
  }
  return out
}

function stringList(v: unknown): string[] | undefined {
  const a = arr(v)
  return a && a.every((x) => typeof x === 'string') ? (a as string[]) : undefined
}

/** Typed content plus the passages nested items cite (nodes, cards), resolved but not yet keyed. */
interface Parsed {
  data: BlockData
  /** Per node / per card, in order; undefined where none. */
  nested: (Citation | undefined)[]
  /** Paragraph text still carrying local [n] marks. */
  localMarks?: boolean
}

/** Builds typed content from what the agent sent, or explains the expected shape. */
async function parseContent(ctx: ToolContext, type: string, raw: unknown, base?: BlockData): Promise<Parsed | ToolResult> {
  const c = obj(raw) ?? {}
  const shape = (t: BlockData['kind']) => fail(`"content" for a ${t} is ${CONTENT_SHAPES[t]}.`)
  const cites = base && 'cites' in base ? base.cites : []
  switch (type) {
    case 'heading': {
      const text = str(c, 'text') ?? (base?.kind === 'heading' ? base.text : undefined)
      if (text === undefined) return shape('heading')
      const level = int(c, 'level') ?? (base?.kind === 'heading' ? base.level : 2)
      if (![1, 2, 3].includes(level)) return fail('"level" must be 1, 2 or 3.')
      return { data: { kind: 'heading', text, level: level as 1 | 2 | 3 }, nested: [] }
    }
    case 'paragraph': {
      const text = str(c, 'text') ?? str(c, 'markdown') ?? (base?.kind === 'paragraph' ? base.markdown : undefined)
      if (text === undefined) return shape('paragraph')
      return { data: { kind: 'paragraph', markdown: text }, nested: [], localMarks: /\[\d+\]/.test(text) }
    }
    case 'callout': {
      const body = str(c, 'body') ?? (base?.kind === 'callout' ? base.body : undefined)
      if (body === undefined) return shape('callout')
      const tone = str(c, 'tone') ?? (base?.kind === 'callout' ? base.tone : 'idea')
      if (!(CALLOUT_TONES as string[]).includes(tone)) return fail(`"${tone}" is not a tone.`, `Tones: ${CALLOUT_TONES.join(', ')}.`)
      return { data: { kind: 'callout', title: str(c, 'title') ?? (base?.kind === 'callout' ? base.title : ''), body, tone: tone as CalloutTone, cites }, nested: [] }
    }
    case 'diagram': {
      const rawNodes = arr(c.nodes)
      if (!rawNodes && base?.kind === 'diagram') return { data: { ...base, title: str(c, 'title') ?? base.title }, nested: [] }
      if (!rawNodes || rawNodes.length === 0) return shape('diagram')
      const nodes: { label: string }[] = []
      const nested: (Citation | undefined)[] = []
      for (const [i, n] of rawNodes.entries()) {
        const node = obj(n)
        const label = node && str(node, 'label')
        if (!label) return fail(`Node ${i + 1} needs a label.`, CONTENT_SHAPES.diagram)
        let citation: Citation | undefined
        if (node.citation !== undefined) {
          const r = await resolveCitation(ctx, node.citation, `node ${i + 1}`)
          if (isFail(r)) return r
          citation = r
        }
        nodes.push({ label })
        nested.push(citation)
      }
      const ref = (v: unknown) => (typeof v === 'number' ? (nodes[v - 1] ? v - 1 : -1) : typeof v === 'string' ? nodes.findIndex((n) => n.label.toLowerCase() === v.toLowerCase()) : -1)
      const rawEdges = arr(c.edges)
      let edges: { from: number; to: number; label?: string }[]
      if (rawEdges && rawEdges.length) {
        edges = []
        for (const [i, e] of rawEdges.entries()) {
          const edge = obj(e)
          const from = edge ? ref(edge.from) : -1
          const to = edge ? ref(edge.to) : -1
          if (from < 0 || to < 0) return fail(`Edge ${i + 1} refers to a node that does not exist.`, `Nodes: ${nodes.map((n, k) => `${k + 1} "${n.label}"`).join(', ')}.`)
          edges.push({ from, to, ...(edge && str(edge, 'label') ? { label: str(edge, 'label') } : {}) })
        }
      } else {
        edges = nodes.slice(1).map((_n, i) => ({ from: i, to: i + 1 }))
      }
      return { data: { kind: 'diagram', title: str(c, 'title') ?? (base?.kind === 'diagram' ? base.title : ''), nodes, edges, cites }, nested }
    }
    case 'comparison': {
      const columns = stringList(c.columns) ?? (base?.kind === 'comparison' ? base.columns : undefined)
      const rawRows = arr(c.rows)
      const rows = rawRows
        ? rawRows.map((r) => {
            const row = obj(r)
            return { label: (row && str(row, 'label')) ?? '', cells: (row && stringList(row.cells)) ?? [] }
          })
        : base?.kind === 'comparison'
          ? base.rows
          : undefined
      if (!columns || !rows || columns.length === 0) return shape('comparison')
      return { data: { kind: 'comparison', title: str(c, 'title') ?? (base?.kind === 'comparison' ? base.title : ''), columns, rows: rows.map((r) => ({ label: r.label, cells: columns.map((_, j) => r.cells[j] ?? '') })) }, nested: [] }
    }
    case 'flashcards': {
      const rawCards = arr(c.cards)
      if (!rawCards && base?.kind === 'flashcards') return { data: base, nested: [] }
      if (!rawCards || rawCards.length === 0) return shape('flashcards')
      const cards: { question: string; answer: string }[] = []
      const nested: (Citation | undefined)[] = []
      for (const [i, k] of rawCards.entries()) {
        const card = obj(k)
        const question = card && str(card, 'question')
        const answer = card && str(card, 'answer')
        if (!question || !answer) return fail(`Card ${i + 1} needs a question and an answer.`, CONTENT_SHAPES.flashcards)
        let citation: Citation | undefined
        if (card.citation !== undefined) {
          const r = await resolveCitation(ctx, card.citation, `card ${i + 1}`)
          if (isFail(r)) return r
          citation = r
        }
        cards.push({ question, answer })
        nested.push(citation)
      }
      return { data: { kind: 'flashcards', cards, cites }, nested }
    }
    case 'quiz': {
      const rawQs = arr(c.questions)
      if (!rawQs && base?.kind === 'quiz') return { data: base, nested: [] }
      if (!rawQs || rawQs.length === 0) return shape('quiz')
      const questions = []
      for (const [i, q] of rawQs.entries()) {
        const question = obj(q)
        const prompt = question && str(question, 'prompt')
        const options = question && stringList(question.options)
        if (!prompt || !options || options.length < 2) return fail(`Question ${i + 1} needs a prompt and at least two options.`, CONTENT_SHAPES.quiz)
        const rawAnswer = question.answer
        const answer = typeof rawAnswer === 'number' ? rawAnswer - 1 : typeof rawAnswer === 'string' ? options.findIndex((o) => o.toLowerCase() === rawAnswer.toLowerCase()) : -1
        if (answer < 0 || answer >= options.length) return fail(`Question ${i + 1}: "answer" must be the 1-based position of the right option or its text.`, `Options: ${options.map((o, k) => `${k + 1} "${o}"`).join(', ')}.`)
        questions.push({ prompt, options, answer, ...(str(question, 'explanation') ? { explanation: str(question, 'explanation') } : {}) })
      }
      return { data: { kind: 'quiz', questions, cites }, nested: [] }
    }
    case 'image': {
      const ref = str(c, 'source') ?? str(c, 'source_id')
      if (!ref && base?.kind === 'image') return { data: { ...base, caption: str(c, 'caption') ?? base.caption }, nested: [] }
      const source = sourceOf(ctx, ref)
      if (isFail(source)) return source
      if (source.kind !== 'image') return fail(`${source.name} is a ${source.kind}; an image block needs an image source.`)
      return { data: { kind: 'image', sourceId: source.id, caption: str(c, 'caption') ?? (base?.kind === 'image' ? base.caption : '') }, nested: [] }
    }
    default:
      return fail(`"${type}" is not a block type.`, `Types: ${BLOCK_KINDS.join(', ')}.`)
  }
}

const unique = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) === i)

/**
 * The block's markdown once its citations have keys: `blockKeys` for block-level citations,
 * `nestedKeys` per node / card. Paragraph `[n]` marks map to the block-level keys.
 */
function markdownFor(parsed: Parsed, blockKeys: string[], nestedKeys: (string | undefined)[]): string {
  const d = parsed.data
  if (d.kind === 'paragraph') {
    let text = d.markdown
    if (parsed.localMarks) {
      text = text.replace(/\[(\d+)\]/g, (m, n: string) => {
        const k = blockKeys[Number(n) - 1]
        return k ? `[^${k}]` : m
      })
    }
    return withCiteMarks('paragraph', text, blockKeys)
  }
  if (d.kind === 'heading' || d.kind === 'image' || d.kind === 'comparison') return withCiteMarks(d.kind, blockToMarkdown(d), blockKeys)
  if (d.kind === 'diagram') return blockToMarkdown({ ...d, nodes: d.nodes.map((n, i) => ({ ...n, ...(nestedKeys[i] ? { cite: nestedKeys[i] } : {}) })), cites: unique([...d.cites, ...blockKeys]) })
  if (d.kind === 'flashcards') return blockToMarkdown({ ...d, cards: d.cards.map((c, i) => ({ ...c, ...(nestedKeys[i] ? { cite: nestedKeys[i] } : {}) })), cites: unique([...d.cites, ...blockKeys]) })
  return blockToMarkdown({ ...d, cites: unique([...d.cites, ...blockKeys]) })
}

/** The passages the user gathered, when a tool asks for them; clears the basket once used. */
function takeCollected(ctx: ToolContext, input: Obj): Citation[] {
  if (input.use_collected !== true) return []
  const collected = ctx.ws.getState().collected
  if (collected.length) ctx.ws.stopCollecting()
  return collected
}

function parsePosition(raw: unknown): Position | ToolResult {
  if (raw === undefined || raw === 'end') return 'end'
  if (raw === 'start') return 'start'
  const p = obj(raw)
  if (p) {
    if (str(p, 'after')) return { after: str(p, 'after')! }
    if (str(p, 'before')) return { before: str(p, 'before')! }
    if (str(p, 'in_section')) return { inSection: str(p, 'in_section')! }
  }
  return fail('"position" is not valid.', positionSchema.description)
}

function describeCitation(ctx: ToolContext, c: Citation, key?: string) {
  const s = ctx.sources.byId(c.sourceId)
  return { ...(key ? { key } : {}), source_id: c.sourceId, source: s?.name ?? 'removed', ...(c.page ? { page: c.page } : {}), ...(c.quote ? { quote: c.quote } : {}) }
}

function describeBlock(ctx: ToolContext, block: ParsedBlock, full: boolean) {
  const { kind: _kind, ...content } = block.data
  return {
    id: block.id,
    type: block.kind,
    ...(full ? { content, markdown: block.raw } : { excerpt: blockExcerpt(block, 160) }),
    citations: ctx.ws.citationsOf(block).map((c, i) => describeCitation(ctx, c, block.citationKeys[i])),
    by: ctx.ws.getState().blockMeta[block.id]?.by ?? 'user',
  }
}

function blockOf(ctx: ToolContext, id: string | undefined): ParsedBlock | ToolResult {
  const block = id ? ctx.ws.blockById(id) : undefined
  if (!block) return fail(`There is no block "${id ?? ''}".`, 'Ids come from get_workspace.')
  return block
}

/** Raw markdown from the agent must be exactly one block and only use footnote keys that exist. */
function checkRawBlock(ctx: ToolContext, markdown: string): string | ToolResult {
  const parsed = parseDocument(markdown)
  if (parsed.blocks.length !== 1) return fail(`"markdown" must hold exactly one block; it holds ${parsed.blocks.length}.`, 'Blocks are separated by blank lines. Add several blocks with several calls.')
  const known = ctx.ws.getState().footnotes
  const unknown = citationKeysIn(markdown).filter((k) => !known.has(k))
  if (unknown.length) return fail(`Unknown footnote key(s): ${unknown.map((k) => `[^${k}]`).join(', ')}.`, `Known keys: ${[...known.keys()].map((k) => `^${k}`).join(', ') || 'none'} — or pass citations and use [1], [2]….`)
  return parsed.blocks[0].raw
}

/** Local `[n]` marks in agent markdown map to the block-level keys, in order. */
const relinkLocal = (text: string, keys: string[]) => text.replace(/\[(\d+)\]/g, (m, n: string) => (keys[Number(n) - 1] ? `[^${keys[Number(n) - 1]}]` : m))

export const TOOLS: ToolDef[] = [
  {
    name: 'list_sources',
    title: 'List the sources',
    description: 'Lists the sources in the workspace: id, name, kind (pdf, text, image), pages, size, and how many blocks cite each one.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async (_input, ctx) => {
      const blocks = ctx.ws.getState().blocks
      const list = ctx.sources.sources.map((s) => ({
        id: s.id,
        name: s.name,
        ...(s.title ? { title: s.title } : {}),
        kind: s.kind,
        ...(s.kind === 'pdf' ? { pages: s.pages } : {}),
        bytes: s.bytes,
        cited_by: blocks.filter((b) => ctx.ws.citationsOf(b).some((c) => c.sourceId === s.id) || (b.data.kind === 'image' && b.data.sourceId === s.id)).length,
      }))
      return { ok: true, summary: list.length ? `${list.length} source(s): ${list.map((s) => s.name).join(', ')}.` : 'No sources yet; the user adds them from the left panel.', sources: list }
    },
  },
  {
    name: 'search_sources',
    title: 'Search the sources',
    description: 'Finds a phrase across the PDF and text sources (or some of them) and returns hits ready to cite: source, page, occurrence, the exact passage and its surroundings.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for; case, spacing and hyphenation are ignored.' },
        sources: { type: 'array', items: sourceParam, description: 'Restrict the search to these sources.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Defaults to 30.' },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, ctx) => {
      const query = str(input, 'query')
      if (!query) return fail('"query" is required.')
      let ids: string[] | undefined
      if (arr(input.sources)) {
        ids = []
        for (const ref of arr(input.sources)!) {
          const s = sourceOf(ctx, typeof ref === 'string' ? ref : undefined)
          if (isFail(s)) return s
          ids.push(s.id)
        }
      }
      const hits = await ctx.sources.search(query, ids, int(input, 'limit') ?? 30)
      return {
        ok: true,
        summary: hits.length ? `${hits.length} hit(s) for "${query}".` : `"${query}" does not appear in the sources.`,
        hits: hits.map((h) => ({ source_id: h.sourceId, source: ctx.sources.byId(h.sourceId)?.name, page: h.page, occurrence: h.occurrence, quote: h.quote, snippet: h.snippet })),
      }
    },
  },
  {
    name: 'read_source',
    title: 'Read a source',
    description: 'Returns the text of one page of a PDF, the whole text of a text source, or an image as a data URL. Quote from it to cite.',
    inputSchema: { type: 'object', properties: { source: sourceParam, page: { ...pageParam, description: 'PDF page to read. Defaults to 1.' } }, required: ['source'] },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, ctx) => {
      const source = sourceOf(ctx, str(input, 'source'))
      if (isFail(source)) return source
      if (source.kind === 'image') {
        const data_url = await ctx.sources.imageDataUrl(source.id)
        return { ok: true, summary: `${source.name}: image.`, source_id: source.id, kind: 'image', data_url }
      }
      const page = int(input, 'page') ?? 1
      const count = ctx.sources.pageCount(source.id)
      if (page < 1 || page > count) return fail(`${source.name} has ${count} page(s); there is no page ${page}.`)
      const index = await ctx.sources.index(source.id, page)
      return { ok: true, summary: `${source.name}${source.kind === 'pdf' ? ` page ${page} of ${count}` : ''}: ${index.text.length} characters.`, source_id: source.id, kind: source.kind, page, page_count: count, text: index.text }
    },
  },
  {
    name: 'get_selection',
    title: 'What the user is pointing at',
    description: 'Returns the selected block (id, type, content, markdown, citations), any text selected in the document, any text selected in an open source, and the passages the user is gathering.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async (_input, ctx) => {
      const state = ctx.ws.getState()
      const block = state.selectedBlockId ? ctx.ws.blockById(state.selectedBlockId) : undefined
      const sel = window.getSelection()
      const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, ' ').trim() : ''
      const node = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement
      const inDocument = !!node?.closest('.document')
      const sheet = node?.closest<HTMLElement>('.sheet')
      const inText = !!node?.closest('.text-source')
      const sourceSelection = text && state.viewer && (sheet || inText) ? { source_id: state.viewer.sourceId, source: ctx.sources.byId(state.viewer.sourceId)?.name, page: sheet ? Number(sheet.dataset.pageNumber) : 1, text } : null
      return {
        ok: true,
        summary: [
          block ? `${block.kind} ${block.id} is selected${text ? ' with text highlighted' : ''}.` : text ? 'Text is selected but no block.' : 'Nothing is selected.',
          state.collecting ? ` The user has gathered ${state.collected.length} passage(s)${state.collectTarget ? ` for block ${state.collectTarget}` : ''} — pass use_collected: true to add_block or link_sources to use them.` : '',
        ].join(''),
        block: block ? describeBlock(ctx, block, true) : null,
        collecting: state.collecting ? { passages: state.collected.map((c) => describeCitation(ctx, c)), target_block_id: state.collectTarget } : null,
        selected_text: inDocument && text ? text : null,
        source_selection: sourceSelection,
        open_source: state.viewer ? { source_id: state.viewer.sourceId, page: state.viewer.page } : null,
      }
    },
  },
  {
    name: 'get_workspace',
    title: 'Read the knowledge space',
    description: 'Returns the title, the sources, every block in order (id, type, excerpt or full content + markdown, citations with their footnote keys), the footnotes, the quiz answers so far, which sections are covered, and — with include_markdown — the whole document as markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        include_content: { type: 'boolean', description: 'Return full block content and markdown instead of excerpts. Defaults to false.' },
        include_markdown: { type: 'boolean', description: 'Also return the whole document as one markdown string (blocks, elements, footnotes).' },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input, ctx) => {
      const state = ctx.ws.getState()
      const full = input.include_content === true
      const quiz = state.blocks.flatMap((b) =>
        b.data.kind === 'quiz'
          ? b.data.questions.map((q, i) => {
              const picked = state.quizAnswers[`${b.id}:${i}`]
              return { block_id: b.id, question: i + 1, prompt: q.prompt, answered: picked !== undefined, correct: picked === undefined ? null : picked === q.answer }
            })
          : [],
      )
      return {
        ok: true,
        summary: `"${state.title}": ${state.blocks.length} block(s) from ${ctx.sources.sources.length} source(s).${state.collecting ? ` The user has gathered ${state.collected.length} passage(s) (see get_selection).` : ''}`,
        title: state.title,
        sources: ctx.sources.sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
        blocks: state.blocks.map((b) => describeBlock(ctx, b, full)),
        footnotes: [...state.footnotes].map(([key, c]) => describeCitation(ctx, c, key)),
        sections: sections(state.blocks, state.quizAnswers).map((s) => ({ heading_id: s.headingId, title: s.title, blocks: s.blockCount, status: s.status })),
        quiz,
        selected_block_id: state.selectedBlockId,
        history: { can_undo: state.past.length, can_redo: state.future.length },
        ...(input.include_markdown === true ? { markdown: state.markdown } : {}),
      }
    },
  },
  {
    name: 'add_block',
    title: 'Add a block to the document',
    description: `Adds a block and shows it at once. Either give "type" and "content" — ${Object.entries(CONTENT_SHAPES)
      .map(([t, s]) => `${t}: ${s}`)
      .join('; ')} — or give raw "markdown" for one block. ${MARKDOWN_HELP}`,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: BLOCK_KINDS },
        content: { type: 'object', description: 'Shape depends on type; see the tool description.' },
        markdown: { type: 'string', description: 'Raw markdown for exactly one block, instead of type + content.' },
        position: positionSchema,
        citations: { type: 'array', items: citationSchema, description: 'Sources this block draws on, in the order the [n] marks refer to.' },
        use_collected: { type: 'boolean', description: 'Also cite the passages the user gathered (get_selection → collecting), before the ones listed here. Clears the basket.' },
      },
    },
    execute: async (input, ctx) => {
      const type = str(input, 'type')
      const rawMd = str(input, 'markdown')
      if (!type && !rawMd) return fail('Pass "type" and "content", or "markdown".', `Types: ${BLOCK_KINDS.join(', ')}.`)
      const listed = await resolveCitations(ctx, input.citations)
      if (isFail(listed)) return listed
      const position = parsePosition(input.position)
      if (isFail(position)) return position
      const idx = insertIndex(ctx.ws.getState().blocks, position)
      if (typeof idx !== 'number') return fail(idx.error, 'Ids come from get_workspace.')
      const blockCites = [...takeCollected(ctx, input), ...listed]

      let inserted: ParsedBlock[]
      if (rawMd) {
        const raw = checkRawBlock(ctx, rawMd)
        if (isFail(raw)) return raw
        const kind = parseDocument(raw).blocks[0].kind
        inserted = ctx.ws.insertBlock((keys) => withCiteMarks(kind, relinkLocal(raw, keys), keys), position, blockCites, 'agent')
      } else {
        const parsed = await parseContent(ctx, type!, input.content)
        if (isFail(parsed)) return parsed
        const nested = parsed.nested.filter((c): c is Citation => c !== undefined)
        inserted = ctx.ws.insertBlock(
          (keys) => {
            const nestedKeys: (string | undefined)[] = []
            let n = blockCites.length
            for (const c of parsed.nested) nestedKeys.push(c ? keys[n++] : undefined)
            return markdownFor(parsed, keys.slice(0, blockCites.length), nestedKeys)
          },
          position,
          [...blockCites, ...nested],
          'agent',
        )
      }
      const block = inserted[0]
      if (!block) return fail('The block came out empty.')
      const after = ctx.ws.blockById(block.id)!
      return { ok: true, summary: `Added ${after.kind} ${after.id}${after.citationKeys.length ? ` citing ${after.citationKeys.length} passage(s)` : ''}.`, block: describeBlock(ctx, after, false) }
    },
  },
  {
    name: 'update_block',
    title: 'Change a block',
    description: 'Changes a block: partial "content" (same shape as add_block for its type; fields left out stay, collections replace), or raw "markdown" for the whole block, and/or "citations" that replace the ones it has.',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        content: { type: 'object', description: "Same shape as add_block for the block's type; partial." },
        markdown: { type: 'string', description: 'Raw markdown replacing the whole block (one block).' },
        citations: { type: 'array', items: citationSchema, description: "Replaces the block's citations." },
      },
      required: ['block_id'],
    },
    execute: async (input, ctx) => {
      const block = blockOf(ctx, str(input, 'block_id'))
      if (isFail(block)) return block
      const rawMd = str(input, 'markdown')
      let citations: Citation[] | undefined
      if (input.citations !== undefined) {
        const parsed = await resolveCitations(ctx, input.citations)
        if (isFail(parsed)) return parsed
        citations = parsed
      }
      let nextRaw: string | undefined
      let parsed: Parsed | undefined
      if (rawMd) {
        const checked = checkRawBlock(ctx, rawMd)
        if (isFail(checked)) return checked
        nextRaw = checked
      } else if (input.content !== undefined) {
        const p = await parseContent(ctx, block.kind, input.content, block.data)
        if (isFail(p)) return p
        parsed = p
      }
      if (nextRaw === undefined && !parsed && !citations) return fail('Nothing to change.', 'Pass content, markdown or citations.')

      const nested = parsed?.nested.filter((c): c is Citation => c !== undefined) ?? []
      ctx.ws.replaceBlock(
        block.id,
        (keys) => {
          const blockKeys = citations ? keys.slice(0, citations.length) : block.citationKeys
          if (parsed) {
            const nestedKeys: (string | undefined)[] = []
            let n = citations ? citations.length : 0
            for (const c of parsed.nested) nestedKeys.push(c ? keys[n++] : undefined)
            const data = citations && 'cites' in parsed.data ? { ...parsed.data, cites: [] } : parsed.data
            return markdownFor({ ...parsed, data }, blockKeys, nestedKeys)
          }
          let raw = nextRaw ?? block.raw
          if (citations) raw = withCiteMarks(block.kind, block.citationKeys.reduce((r, k) => withoutCiteMark(r, k), relinkLocal(raw, blockKeys)), blockKeys)
          return raw
        },
        [...(citations ?? []), ...nested],
      )
      const after = ctx.ws.blockById(block.id)
      return { ok: true, summary: `Updated ${block.kind} ${block.id}.`, ...(after ? { block: describeBlock(ctx, after, false) } : {}) }
    },
  },
  {
    name: 'remove_block',
    title: 'Delete blocks',
    description: 'Deletes one or more blocks from the document. undo brings them back.',
    inputSchema: { type: 'object', properties: { block_ids: { type: 'array', items: { type: 'string' }, minItems: 1 } }, required: ['block_ids'] },
    execute: async (input, ctx) => {
      const ids = stringList(input.block_ids)
      if (!ids || ids.length === 0) return fail('"block_ids" must list at least one id.')
      const missing = ids.filter((id) => !ctx.ws.blockById(id))
      if (missing.length) return fail(`There is no block ${missing.join(', ')}.`, 'Ids come from get_workspace.')
      ctx.ws.removeBlocks(ids)
      return { ok: true, summary: `Deleted ${ids.length} block(s). Use undo to restore them.`, removed: ids }
    },
  },
  {
    name: 'move_block',
    title: 'Move a block',
    description: 'Moves a block to another position in the document.',
    inputSchema: { type: 'object', properties: { block_id: { type: 'string' }, position: positionSchema }, required: ['block_id', 'position'] },
    execute: async (input, ctx) => {
      const block = blockOf(ctx, str(input, 'block_id'))
      if (isFail(block)) return block
      const position = parsePosition(input.position)
      if (isFail(position)) return position
      const idx = insertIndex(ctx.ws.getState().blocks, position, block.id)
      if (typeof idx !== 'number') return fail(idx.error, 'Ids come from get_workspace.')
      ctx.ws.moveBlock(block.id, position)
      return { ok: true, summary: `Moved ${block.kind} ${block.id}.`, index: ctx.ws.getState().blocks.findIndex((b) => b.id === block.id) }
    },
  },
  {
    name: 'focus_block',
    title: 'Bring the user to a block',
    description: 'Selects a block, scrolls the document to it and flashes it, so the user sees what you are talking about.',
    inputSchema: { type: 'object', properties: { block_id: { type: 'string' } }, required: ['block_id'] },
    execute: async (input, ctx) => {
      const block = blockOf(ctx, str(input, 'block_id'))
      if (isFail(block)) return block
      ctx.ws.focusBlock(block.id)
      return { ok: true, summary: `Focused ${block.kind} ${block.id}.` }
    },
  },
  {
    name: 'open_source',
    title: 'Open a source for the user',
    description: 'Opens a source in the viewer beside the document, at a page or at a quoted passage, which is marked.',
    inputSchema: { type: 'object', properties: { source: sourceParam, page: pageParam, quote: quoteParam, occurrence: { type: 'integer', minimum: 1 } }, required: ['source'] },
    execute: async (input, ctx) => {
      const source = sourceOf(ctx, str(input, 'source'))
      if (isFail(source)) return source
      if (str(input, 'quote')) {
        const citation = await resolveCitation(ctx, { ...input, source: source.id }, 'quote')
        if (isFail(citation)) return citation
        ctx.ws.openViewer({ sourceId: source.id, page: citation.page, citation })
        return { ok: true, summary: `Opened ${source.name} at page ${citation.page}, on "${(citation.quote ?? '').slice(0, 50)}".` }
      }
      const page = int(input, 'page')
      if (page && page > ctx.sources.pageCount(source.id)) return fail(`${source.name} has ${ctx.sources.pageCount(source.id)} page(s).`)
      ctx.ws.openViewer({ sourceId: source.id, page })
      return { ok: true, summary: `Opened ${source.name}${page ? ` at page ${page}` : ''}.` }
    },
  },
  {
    name: 'highlight_source',
    title: 'Highlight a passage in a PDF',
    description: 'Leaves a persistent coloured wash on a quoted passage of a PDF source, with an optional note. Visible whenever that source is open.',
    inputSchema: {
      type: 'object',
      properties: { source: sourceParam, page: pageParam, quote: quoteParam, occurrence: { type: 'integer', minimum: 1 }, kind: { type: 'string', enum: HIGHLIGHT_KINDS, description: 'What the passage is. Defaults to "claim".' }, note: { type: 'string' } },
      required: ['source', 'quote'],
    },
    execute: async (input, ctx) => {
      const source = sourceOf(ctx, str(input, 'source'))
      if (isFail(source)) return source
      if (source.kind !== 'pdf') return fail(`Only PDFs take highlights; ${source.name} is a ${source.kind}.`, 'Cite the passage in a block instead.')
      const citation = await resolveCitation(ctx, { ...input, source: source.id }, 'quote')
      if (isFail(citation)) return citation
      const resolved = await ctx.sources.resolve(citation)
      if (!resolved) return fail('The passage could not be placed on the page.')
      const kind = (str(input, 'kind') ?? 'claim') as HighlightKind
      if (!HIGHLIGHT_KINDS.includes(kind)) return fail(`"${kind}" is not a kind.`, `Kinds: ${HIGHLIGHT_KINDS.join(', ')}.`)
      const h = ctx.ws.addHighlight({ sourceId: source.id, page: resolved.page, rects: resolved.rects, text: resolved.text, kind, ...(str(input, 'note') ? { note: str(input, 'note') } : {}) })
      return { ok: true, summary: `Highlighted "${resolved.text.slice(0, 50)}…" on page ${resolved.page} of ${source.name} as ${kind}.`, id: h.id, page: resolved.page }
    },
  },
  {
    name: 'link_sources',
    title: 'Link passages to a block',
    description: 'Attaches passages from the sources to an existing block, keeping what it already cites: the ones listed and/or the ones the user gathered. Text blocks get a [^k] mark per passage at the end; elements get them in their cites attribute. Place marks yourself with update_block if you want them elsewhere.',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string', description: 'Defaults to the block the user started collecting for, if any.' },
        passages: { type: 'array', items: citationSchema },
        use_collected: { type: 'boolean', description: 'Link the passages the user gathered (get_selection → collecting). Clears the basket.' },
      },
    },
    execute: async (input, ctx) => {
      const block = blockOf(ctx, str(input, 'block_id') ?? ctx.ws.getState().collectTarget ?? undefined)
      if (isFail(block)) return block
      const listed = await resolveCitations(ctx, input.passages)
      if (isFail(listed)) return listed
      const citations = [...takeCollected(ctx, input), ...listed]
      if (citations.length === 0) return fail('Nothing to link.', 'List passages ({ source, page?, quote? }) or pass use_collected: true.')
      const keys = ctx.ws.linkSources(block.id, citations)
      const after = ctx.ws.blockById(block.id)!
      return { ok: true, summary: `Linked ${citations.length} passage(s) to ${block.kind} ${block.id} as ${keys.map((k) => `[^${k}]`).join(' ')}; it now cites ${after.citationKeys.length}.`, keys, block: describeBlock(ctx, after, false) }
    },
  },
]

/** What changed between two snapshots, in words an agent can act on. */
function diffSummary(before: ParsedBlock[], after: ParsedBlock[]) {
  const a = new Map(before.map((b) => [b.id, b]))
  const b = new Map(after.map((x) => [x.id, x]))
  const label = (x: ParsedBlock) => `${x.kind} ${x.id}`
  return {
    restored: after.filter((x) => !a.has(x.id)).map(label),
    removed: before.filter((x) => !b.has(x.id)).map(label),
    changed: after.filter((x) => a.has(x.id) && a.get(x.id)!.raw !== x.raw).map(label),
  }
}

for (const dir of ['undo', 'redo'] as const) {
  TOOLS.push({
    name: dir,
    title: dir === 'undo' ? 'Undo the last change' : 'Redo an undone change',
    description: dir === 'undo' ? 'Takes back the most recent change to the document or highlights — or several with steps — and reports what came back.' : 'Re-applies changes taken back with undo, one or several with steps.',
    inputSchema: { type: 'object', properties: { steps: { type: 'integer', minimum: 1, description: 'How many changes. Defaults to 1.' } } },
    execute: async (input, ctx) => {
      const steps = int(input, 'steps') ?? 1
      const before = ctx.ws.getState().blocks
      let done = 0
      while (done < steps && (dir === 'undo' ? ctx.ws.undo() : ctx.ws.redo())) done++
      if (done === 0) return fail(`There is nothing to ${dir}.`)
      const diff = diffSummary(before, ctx.ws.getState().blocks)
      const parts = [diff.restored.length && `restored ${diff.restored.join(', ')}`, diff.removed.length && `removed ${diff.removed.join(', ')}`, diff.changed.length && `reverted ${diff.changed.join(', ')}`].filter(Boolean)
      const state = ctx.ws.getState()
      return { ok: true, summary: `${dir === 'undo' ? 'Undid' : 'Redid'} ${done} change(s)${parts.length ? ': ' + parts.join('; ') : ''}.`, steps: done, ...diff, can_undo: state.past.length, can_redo: state.future.length }
    },
  })
}

/** Runs one tool by name; unknown names and thrown errors come back as data. */
export async function runTool(name: string, input: unknown, ctx: ToolContext | null): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return fail(`There is no tool "${name}".`, `Tools: ${TOOLS.map((t) => t.name).join(', ')}.`)
  if (!ctx) return fail('The workspace is not ready yet.')
  try {
    return await tool.execute(obj(input) ?? {}, ctx)
  } catch (err: unknown) {
    return fail(err instanceof Error ? err.message : String(err), `Tool: ${name}.`)
  }
}
