# The WebMCP tools

Haoku has no chat box. Everything the app can do is published as tools on the browser's
[WebMCP](https://github.com/webmachinelearning/webmcp) surface, and the agent the user already has in
their browser drives the app through them: it reads their sources, writes into the document, opens a
PDF at the page it is talking about, and adds practice questions.

This page is the reference for those tools. The short version is in the [README](README.md).

## Registration

A WebMCP tool is a name, a description the agent reads to decide when to use it, a schema for its
input, and the function that runs it. For example:

```js
document.modelContext.registerTool({ name: "search_products", description: "Search the product catalog", inputSchema: { /* ... */ } execute: async (input) => { /* ... */ } });
```

Haoku registers twenty of them, and none of them talk to a server. This is one of ours:

```ts
document.modelContext.registerTool({
  name: 'search_sources',
  description: 'Finds a phrase across the PDF and text sources (or some of them) and returns hits ready to cite: source, page, occurrence, the exact passage and its surroundings.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Words to look for; case, spacing and hyphenation are ignored.' },
      sources: { type: 'array', items: { type: 'string' }, description: 'Restrict the search to these sources.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Defaults to 30.' },
    },
    required: ['query'],
  },
  execute: async (input) => searchSources(input),
})
```

On load, `src/tools/webmcp.ts` walks the catalog and registers all of them the same way, on
`document.modelContext` (falling back to `navigator.modelContext`, where some builds still expose
it):

```ts
for (const tool of TOOLS) {
  await document.modelContext.registerTool({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    execute: (input) => runTool(tool.name, input),
  })
}
```

WebMCP needs a secure context, so HTTPS or localhost. The `webmcp` chip in the top bar lights up with
the number registered; `window.haoku.tools.status()` returns `{ supported, api, registered, failed,
error }` if you want the detail. Every call is visible to the user while it runs: a floating badge
shows what is executing and the last five results.

## What shapes the catalog

**A tool cannot invent a citation.** Every passage an agent cites is resolved against the stored file
before anything is written: the quote has to be there. The tool answers with the page and the exact
text it matched, or refuses:

```json
{ "ok": false,
  "error": "citation 1: \"a summary of the meeting\" does not appear in episodic-memory-for-agents.pdf.",
  "hint": "Copy the passage from read_source, or find it with search_sources." }
```

**Each passage backs one block.** The passages the user gathered in the context are the material a
new block is built from, and they are used by default. A passage another block already cites is
refused, so the same evidence is never quietly reused:

```json
{ "ok": false,
  "error": "\"Each iteration is a fresh call to a model…\" is already cited by paragraph b_98c8789b.",
  "hint": "Every passage backs one block: cite a different one, or work on that block with update_block or link_sources." }
```

**Errors are data.** A failing call never throws: it returns `{ ok: false, error, hint }`, where the
hint carries the shape or the ids the agent got wrong, so it can correct itself in the next call.

## Reading the sources

### `list_sources`
No input. What the user has added, with `cited_by` so you can see what is already in use.

```json
{ "ok": true,
  "summary": "5 source(s): episodic-memory-for-agents.pdf, memory-systems-lecture-notes.pdf, …",
  "sources": [
    { "id": "s_ae180ca4", "name": "episodic-memory-for-agents.pdf",
      "title": "Episodic Memory for Language Agents — demo paper",
      "kind": "pdf", "pages": 4, "bytes": 14118, "cited_by": 3 }
  ] }
```

### `search_sources`
`{ query*, sources?, limit? }` — full text across every source, or the ones listed. Each hit comes
back ready to cite: `source_id`, `page`, `occurrence`, the `quote` as it reads in the file, and a
`snippet` with the surrounding text.

### `read_source`
`{ source*, page? }` — one page of a PDF, the whole text of a text source, or an image as a data URL.
`source` is an id or a file name. Quote from what it returns and the citation will resolve.

## Where the user is

### `get_selection`
No input. The selected block, any text selected in the document or in the open source, which source
is open, and how many passages wait in the context.

```json
{ "ok": true,
  "summary": "paragraph b_98c8789b is selected. 2 passage(s) wait in the context, 1 of them free — read them with list_context.",
  "block": { "id": "b_98c8789b", "type": "paragraph", "content": { … }, "citations": [ … ] },
  "selected_text": null,
  "source_selection": { "source_id": "s_ae180ca4", "source": "…pdf", "page": 2, "text": "…" },
  "open_source": { "source_id": "s_ae180ca4", "page": 2 },
  "gathered": { "total": 2, "free": 1, "read_with": "list_context" } }
```

### `list_context`
No input. The passages the user gathered from the sources, in two groups.

```json
{ "ok": true,
  "summary": "1 free passage(s) to build with, and 1 the document already cites.",
  "free": [
    { "source_id": "s_2f86690d", "source": "memory-systems-lecture-notes.pdf", "page": 2,
      "quote": "Four failure modes: stale memory, retrieval miss, memory poisoning, over-retrieval" }
  ],
  "used": [
    { "source_id": "s_f56acb63", "source": "reading-notes.md", "page": 1,
      "quote": "forgetting is a feature",
      "cited_by": [ { "block_id": "b_3c13e0af", "type": "callout" } ] }
  ] }
```

`free` is the material: nothing cites it yet, and `add_block` and `link_sources` take it by default.
`used` is there so you can tell the two apart — those passages are already in the document, and
citing one again is refused. For what the document says use `get_workspace`; to read a source itself
use `read_source`.

## The document

### `get_workspace`
`{ include_content?, include_markdown? }` — the whole space: title, sources, every block in order,
the footnotes, which sections are covered, and the history depth. With `include_content` the blocks
carry their full content and markdown instead of an excerpt; with `include_markdown` the answer also
holds the document as one markdown string.

```json
{ "title": "Memory in AI agents",
  "blocks": [
    { "id": "b_98c8789b", "type": "paragraph", "excerpt": "A language agent is a loop…",
      "citations": [ { "key": "1", "source_id": "s_ae180ca4", "page": 1, "quote": "…" } ],
      "by": "user" }
  ],
  "footnotes": [ { "key": "1", "source_id": "s_ae180ca4", "source": "…pdf", "page": 1, "quote": "…" } ],
  "sections": [ { "heading_id": "b_59efbe38", "title": "Why a context window is not memory", "blocks": 2, "status": "done" } ],
  "selected_block_id": "b_98c8789b" }
```

### `set_title`
`{ title }` — renames the space: the name in the top bar, the title of the printed document and the
file name of an export. The user can undo it.

```json
{ "summary": "The space is now called “Memory in AI agents” (was “Untitled space”).",
  "title": "Memory in AI agents", "previous_title": "Untitled space" }
```

### `add_block`
`{ type?, content?, markdown?, position?, citations?, use_collected? }` — either a `type` with its
`content`, or raw `markdown` for exactly one block. The block types and their content:

| type | content |
|---|---|
| `heading` | `{ text, level?: 1｜2｜3 }` |
| `paragraph` | `{ text }` — markdown; write `[1]`, `[2]`… where each citation applies |
| `callout` | `{ title?, body, tone?: "idea"｜"example"｜"warning"｜"why" }` |
| `diagram` | `{ title?, nodes: [{ label, citation? }], edges?: [{ from, to, label? }] }` — any graph, laid out for you |
| `comparison` | `{ title?, columns: [string], rows: [{ label, cells: [string] }] }` |
| `image` | `{ source, caption? }` — an image source |

`position` is `"end"` (default), `"start"`, `{ after }`, `{ before }` or `{ in_section }`.
`citations` are `{ source*, page?, quote?, occurrence? }`, in the order the `[n]` marks refer to.
The free passages in the context are cited too unless you pass `use_collected: false`.

### `update_block`
`{ block_id*, content?, markdown?, citations? }` — a partial `content` (fields left out stay,
collections replace), raw `markdown` for the whole block, or new `citations`. A block may keep the
passages it already cites.

### `remove_block` · `move_block` · `focus_block`
`{ block_ids* }` deletes; `{ block_id*, position* }` moves; `{ block_id* }` scrolls the user to a
block and selects it, which is how you point at what you are talking about.

### `link_sources`
`{ block_id?, passages?, use_collected? }` — attaches passages to a block, keeping what it already
cites. Without `block_id` it works on the selected block. Text blocks get a `[^k]` mark each;
elements carry them in their `cites` attribute.

## Showing things to the user

### `open_source`
`{ source*, page?, quote?, occurrence? }` — opens the source in the viewer at that page, with the
quote marked. Use it whenever you refer to a passage: the user sees what you are reading.

### `highlight_source`
`{ source*, page?, quote*, occurrence?, kind?, note? }` — leaves a persistent highlight on a PDF
passage. `kind` is `claim` (default), `definition`, `evidence` or `concept`, and `note` is an optional aside.

## Practice

### `add_practice` · `list_practice` · `remove_practice`
`{ items* }` adds multiple-choice questions, each `{ prompt, options, answer, explanation?,
citation?, topic? }`, tied to the passage it checks. `list_practice` returns the deck with how the
user has done on each question (seen, right, wrong); `remove_practice` takes `{ ids* }`. Questions
live outside the document, in the practice tab.

## History

### `undo` · `redo`
`{ steps? }` — takes back or re-applies changes to the document and reports what came back, plus how
much history is left. Practice progress is not part of it.

## Driving them without an agent

The same catalog is on `window.haoku.tools`, which is how the app is tested from the console:

```js
await window.haoku.tools.call('add_block', {
  type: 'paragraph',
  content: { text: 'Every call to a model starts from nothing [1].' },
  citations: [{ source: 'memory-systems-lecture-notes.pdf', quote: 'starts from nothing' }],
})

window.haoku.tools.list()        // name, title, description, inputSchema
window.haoku.tools.status()      // { supported, api, registered, failed, error }
window.haoku.tools.register()    // re-register, e.g. after enabling the API
```
