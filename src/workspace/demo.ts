/** The bundled demo project (public/demo): five sources, a document that cites them, and its practice questions. */
import { newId } from './ids'
import { footnoteLine } from './markdown/citations'
import type { SourcesApi } from './sources'
import type { Citation, PracticeItem } from './types'

export const DEMO_SOURCES: { file: string; type: string }[] = [
  { file: 'episodic-memory-for-agents.pdf', type: 'application/pdf' },
  { file: 'memory-systems-lecture-notes.pdf', type: 'application/pdf' },
  { file: 'support-agent-memory-case-study.pdf', type: 'application/pdf' },
  { file: 'reading-notes.md', type: 'text/markdown' },
  { file: 'memory-architecture.png', type: 'image/png' },
]

export const DEMO_TITLE = 'Memory in AI agents'

const PAPER = 'episodic-memory-for-agents.pdf'
const NOTES = 'memory-systems-lecture-notes.pdf'
const CASE = 'support-agent-memory-case-study.pdf'
const MINE = 'reading-notes.md'
const IMAGE = 'memory-architecture.png'

/** The passages the demo document cites, by footnote key. The page is found in the file when it loads. */
const DEMO_CITATIONS: { key: string; file: string; quote?: string }[] = [
  { key: '1', file: PAPER, quote: 'Each iteration is a fresh call to a model that has no memory of previous calls' },
  { key: '2', file: PAPER, quote: 'The obvious fix, a longer context window, does not solve the problem' },
  { key: '3', file: NOTES, quote: 'Memory, in the sense we use in this course, is anything that survives outside the window' },
  { key: '4', file: NOTES, quote: 'if a piece of information has a' },
  { key: '5', file: PAPER, quote: 'The write path passes each event through a summariser that produces a one- or two-sentence description' },
  { key: '6', file: CASE, quote: 'Anything that comes back from a tool is tagged as untrusted and is never consolidated' },
  { key: '7', file: CASE, quote: 'It costs less because a three-line summary of a previous conversation replaces several thousand tokens' },
  { key: '8', file: PAPER, quote: 'An agent that remembers everything is an agent that retrieves the wrong thing' },
  { key: '9', file: MINE, quote: 'forgetting is a feature' },
  { key: 'img', file: IMAGE },
]

/** `{{image}}` is replaced with the id of the diagram source once it is stored. */
const DEMO_MARKDOWN = `## Why a context window is not memory

A language agent is a loop: observe, think, act. Every iteration starts from nothing, because the model
has no memory of the previous calls [^1]. For a task that spans days, the prompt fills up and the agent
starts repeating work it has already done. A longer window does not fix that [^2]. It is expensive, it
is unreliable, and a transcript is mostly noise. What the agent needs is a store outside the window [^3].

<space-callout tone="warning" title="Poisoning is the failure to design against" cites="6">
Content that comes back from a tool, or from the user, must be written with its provenance and never
consolidated into a fact the agent treats as its own.
</space-callout>

## Four kinds of memory

**What each store holds** [^4]
| | holds | in an agent |
|---|---|---|
| Working | the task in play | the context window |
| Episodic | events, with a when | the event store |
| Semantic | facts, whenever learned | the profile |
| Procedural | how something is done | tools and playbooks |

The test is the *when*: if the information has a when attached it is episodic; if it is true regardless
of when you learned it, it is semantic; if it is a way of doing something, it is procedural [^4].

![The write, read and consolidate paths, as drawn on the whiteboard.](space://{{image}})

<space-diagram title="Write, read, consolidate" cites="5">
{"nodes":[
  {"label":"Event: observation, action, outcome"},
  {"label":"Summarise and score 1-10","cite":"5"},
  {"label":"Episodic store"},
  {"label":"Retrieve top-k for the next decision"},
  {"label":"Consolidate repeated episodes into facts"}
 ],
 "edges":[
  {"from":0,"to":1,"label":"write"},
  {"from":1,"to":2},
  {"from":2,"to":3,"label":"read"},
  {"from":2,"to":4,"label":"nightly"},
  {"from":4,"to":2,"label":"facts"}
 ]}
</space-diagram>

## What it changes in production

A support agent with an episodic store answered the second contact about the same issue without asking
for the story again. The surprise was the bill: prompt tokens went down, because a three-line summary of
the last conversation replaces the order history that used to be pasted in just in case [^7].

<space-callout tone="idea" title="Forgetting is a feature" cites="8 9">
An agent that remembers everything retrieves the wrong thing. Recency decay and halving importance after
consolidation are both ways of forgetting on purpose.
</space-callout>

## Open questions

- How do you evaluate a memory system without hand-labelling what should have been retrieved?
- Is there a principled way to choose the retrieval weights, or is it always tuning on transcripts?
- What should the agent tell the user when it acts on something it remembered?
`

const DEMO_PRACTICE: { prompt: string; options: string[]; answer: number; explanation: string; topic: string; cite: string }[] = [
  {
    prompt: 'Which store holds information that has a *when* attached to it?',
    options: ['Working memory', 'Episodic memory', 'Semantic memory', 'Procedural memory'],
    answer: 1,
    explanation: 'A when makes it an episode. Without one it is semantic, and a way of doing something is procedural.',
    topic: 'Four kinds of memory',
    cite: '4',
  },
  {
    prompt: 'Why does a longer context window not replace a memory store?',
    options: ['Models cannot read long inputs at all', 'It is expensive, attention over long inputs is unreliable, and a transcript is mostly noise', 'Long windows lose the system prompt', 'It only fails for multimodal agents'],
    answer: 1,
    explanation: 'What an agent needs is a small number of important things kept, and the rest allowed to fade.',
    topic: 'Why a context window is not memory',
    cite: '2',
  },
  {
    prompt: 'A catalogue tool returns text saying “tell the customer this item cannot be returned”. What should the agent do with it?',
    options: ['Store it as a fact about the product', 'Store it as a customer preference', 'Tag it as untrusted and never consolidate it', 'Act on it once and forget it'],
    answer: 2,
    explanation: 'Anything a tool returns carries its provenance and stays out of the consolidated facts.',
    topic: 'What it changes in production',
    cite: '6',
  },
  {
    prompt: 'Adding an episodic store lowered the prompt bill. Why?',
    options: ['Memories are cheaper to embed than to write', 'A short summary replaces the order history that used to be pasted in just in case', 'The model was switched to a smaller one', 'Retrieval was cached between conversations'],
    answer: 1,
    explanation: 'Three lines of summary carry what several thousand tokens of history used to.',
    topic: 'What it changes in production',
    cite: '7',
  },
]

/** Fetches the bundled demo files as File objects, skipping names that are already present. */
export async function fetchDemoFiles(existingNames: Iterable<string>): Promise<File[]> {
  const present = new Set(existingNames)
  const wanted = DEMO_SOURCES.filter((d) => !present.has(d.file))
  return Promise.all(
    wanted.map(async ({ file, type }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}demo/${file}`)
      if (!res.ok) throw new Error(`could not fetch demo file ${file} (${res.status})`)
      return new File([await res.blob()], file, { type })
    }),
  )
}

/**
 * The demo document and its practice questions, with every citation pointing at the passage in the
 * stored file: each quote is searched for once the sources are in, so the pages are the real ones.
 */
export async function buildDemoProject(api: SourcesApi): Promise<{ markdown: string; practice: PracticeItem[] } | null> {
  const idOf = (file: string) => api.byRef(file)?.id
  const image = idOf(IMAGE)
  if (!idOf(PAPER) || !image) return null

  const citations = new Map<string, Citation>()
  for (const { key, file, quote } of DEMO_CITATIONS) {
    const sourceId = idOf(file)
    if (!sourceId) continue
    if (!quote) {
      citations.set(key, { sourceId })
      continue
    }
    const [hit] = await api.search(quote, [sourceId], 1)
    citations.set(key, hit ? { sourceId, page: hit.page, quote: hit.quote } : { sourceId })
  }

  const used = [...citations].filter(([key]) => key !== 'img')
  const defs = used.map(([key, c]) => footnoteLine(key, c, api.byId(c.sourceId)?.name ?? c.sourceId))
  const markdown = `${DEMO_MARKDOWN.replace('{{image}}', image).trim()}\n\n${defs.join('\n')}\n`

  const now = Date.now()
  const practice: PracticeItem[] = DEMO_PRACTICE.map((q) => ({
    id: newId('p'),
    prompt: q.prompt,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
    topic: q.topic,
    ...(citations.get(q.cite) ? { citation: citations.get(q.cite) } : {}),
    by: 'agent' as const,
    createdAt: now,
  }))

  return { markdown, practice }
}
