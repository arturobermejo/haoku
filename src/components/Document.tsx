import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { blockLabel } from '../workspace/markdown/excerpt'
import { blockToMarkdown } from '../workspace/markdown/serialize'
import type { BlockData, ParsedBlock } from '../workspace/markdown/types'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation, Position } from '../workspace/types'
import { BlockBody } from './blocks/BlockBody'
import { EditableText } from './EditableText'
import { FromSourcesButton, FromSourcesTray } from './FromSources'
import './Document.css'
import './blocks/blocks.css'

const JUST_ADDED_MS = 30_000
const FLASH_MS = 1400

/** The knowledge space: a markdown document shown as blocks the user and the agent both edit. */
export function Document() {
  const ws = useWorkspace()
  const { byId } = useSources()
  const [now, setNow] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState<'block' | 'sources' | null>(null)
  // The block whose editor opens by itself, with the markdown it was created with: once the user types
  // something else, the raw differs and it stops re-opening.
  const [autoEdit, setAutoEdit] = useState<{ id: string; raw: string } | null>(null)
  // Which gap between blocks has its insert menu open: the id of the block above, or 'start'.
  const [gapOpen, setGapOpen] = useState<string | null>(null)
  // Which block has its sources menu open.
  const [sourcesFor, setSourcesFor] = useState<string | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const flashId = ws.focusKey && now - ws.focusKey < FLASH_MS ? ws.selectedBlockId : null

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 2500)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!ws.focusKey || !ws.selectedBlockId) return
    const el = pageRef.current?.querySelector<HTMLElement>(`[data-block-id="${ws.selectedBlockId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = window.setTimeout(() => setNow(Date.now()), FLASH_MS + 50)
    return () => window.clearTimeout(t)
  }, [ws.focusKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Events the space-* elements emit bubble up here.
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const blockOf = (e: Event) => (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
    const onChange = (e: Event) => {
      const id = blockOf(e)
      const block = id ? ws.blockById(id) : undefined
      if (!block) return
      const payload = (e as CustomEvent<{ data: Record<string, unknown> }>).detail.data
      ws.updateBlockData(id!, { ...block.data, ...payload } as BlockData)
    }
    // A mark inside an element selects its block, like one in plain text; the source opens from the context panel.
    const onCite = (e: Event) => {
      const id = blockOf(e)
      if (id) ws.select(id)
    }
    page.addEventListener('space-change', onChange)
    page.addEventListener('space-cite', onCite)
    return () => {
      page.removeEventListener('space-change', onChange)
      page.removeEventListener('space-cite', onCite)
    }
  }, [ws])

  /**
   * Caught before the editor sees the click: a citation mark selects its block, so the context panel
   * shows the passages it draws on (the source itself opens from there); an image opens its source.
   */
  const onClickCapture = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement
    const mark = target.closest<HTMLElement>('.cite[data-key]')
    if (mark && !target.closest('space-callout, space-diagram')) {
      const id = target.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
      e.preventDefault()
      e.stopPropagation()
      if (id) ws.select(id)
      return
    }
    const img = target.closest<HTMLImageElement>('img[data-source-id]')
    if (img) {
      e.preventDefault()
      e.stopPropagation()
      ws.openViewer({ sourceId: img.dataset.sourceId! })
    }
  }

  // A click outside every block deselects; the strips, the tray and the add row act on the selection, so they don't.
  const clearSelection = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-block-id], .block--draft, .block-gap, .tray, .document-add, .raw-view')) return
    setSourcesFor(null)
    ws.select(null)
  }

  const sourceLine = (block: ParsedBlock) => {
    const cites = ws.citationsOf(block)
    if (cites.length === 0) return null
    if ((block.kind === 'paragraph' || block.kind === 'heading') && /\[\^\w+\]/.test(block.raw)) return null
    const seen = new Set<string>()
    const items: { key: string; label: string; citation: Citation }[] = []
    for (const c of cites) {
      const source = byId(c.sourceId)
      const name = (source?.title ?? source?.name ?? 'removed source').replace(/\.[a-z0-9]+$/i, '')
      const label = `${name.length > 34 ? `${name.slice(0, 34)}…` : name}${c.page ? ` p.${c.page}` : ''}`
      if (seen.has(label)) continue
      seen.add(label)
      items.push({ key: label, label, citation: c })
    }
    return (
      <div className="block-sources">
        <span>sources</span>
        {items.map((it) => (
          <button key={it.key} type="button" className="block-source" onClick={() => ws.openViewer({ sourceId: it.citation.sourceId, page: it.citation.page, citation: it.citation })}>
            · {it.label}
          </button>
        ))}
      </div>
    )
  }

  // A heading or paragraph starts as a draft editor (an empty block cannot exist in markdown); it joins
  // the document once some text is committed. Elements can be empty, so they go in at once.
  const [draft, setDraft] = useState<{ kind: 'heading' | 'paragraph'; position: Position } | null>(null)
  const addManual = (data: BlockData, position: Position = 'end') => {
    setMenuOpen(null)
    setGapOpen(null)
    if (data.kind === 'heading' || data.kind === 'paragraph') {
      setDraft({ kind: data.kind, position })
      return
    }
    const [block] = ws.insertBlock(blockToMarkdown(data), position)
    if (block) setAutoEdit({ id: block.id, raw: block.raw })
  }
  const draftEditor = draft && (
    <section key="draft" className={`block block--${draft.kind} block--draft`}>
      <EditableText
        as="div"
        value=""
        placeholder={draft.kind === 'heading' ? 'section title' : 'write…'}
        className={draft.kind === 'heading' ? 'heading heading--2' : 'paragraph'}
        multiline={draft.kind === 'paragraph'}
        autoEdit
        onChange={(text) => {
          if (!text.trim()) return
          const raw = draft.kind === 'heading' && !/^#{1,3}\s/.test(text) ? `## ${text.trim()}` : text
          const [block] = ws.insertBlock(raw, draft.position)
          if (block) ws.select(block.id)
        }}
        onDone={() => setDraft(null)}
      />
    </section>
  )
  const draftAt = (position: Position) => (draft && JSON.stringify(draft.position) === JSON.stringify(position) ? [draftEditor] : [])

  const KINDS: { label: string; data: BlockData }[] = [
    { label: 'heading', data: { kind: 'heading', text: '', level: 2 } },
    { label: 'paragraph', data: { kind: 'paragraph', markdown: '' } },
    { label: 'callout', data: { kind: 'callout', title: '', body: '', tone: 'idea', cites: [] } },
  ]

  /** The thin strip between two blocks: hover shows +, click offers the kinds, the block lands right there. */
  const gap = (afterId: string | null) => {
    const key = afterId ?? 'start'
    const position: Position = afterId ? { after: afterId } : 'start'
    const open = gapOpen === key
    return (
      <div key={`gap-${key}`} className={`block-gap${open ? ' is-open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <span className="block-gap-line" />
        {open ? (
          <div className="block-gap-menu">
            {KINDS.map((k) => (
              <button key={k.label} type="button" className="control" onClick={() => addManual(k.data, position)}>
                {k.label}
              </button>
            ))}
            <button type="button" className="block-gap-close" title="cancel" onClick={() => setGapOpen(null)}>
              ×
            </button>
          </div>
        ) : (
          <button type="button" className="block-gap-add" title="insert a block here" onClick={() => setGapOpen(key)}>
            +
          </button>
        )}
      </div>
    )
  }

  return (
    <main className="document scroll" onClick={clearSelection}>
      <div ref={pageRef} className="document-page" onClickCapture={onClickCapture}>
        {ws.rawView ? (
          <RawEditor />
        ) : ws.blocks.length === 0 ? (
          <div className="document-empty">
            <div className="document-empty-title">This space is empty.</div>
            <div className="document-empty-body">Add sources on the left and ask your agent to explain them — or gather passages yourself and turn them into a block.</div>
          </div>
        ) : (
          ws.blocks.flatMap((block, index) => {
            const meta = ws.blockMeta[block.id]
            const justAdded = meta?.by === 'agent' && now - meta.createdAt < JUST_ADDED_MS
            const label = blockLabel(block)
            const classes = ['block', `block--${block.kind}`, ws.selectedBlockId === block.id ? 'is-selected' : '', ws.linkTarget === block.id ? 'is-linking' : '', flashId === block.id ? 'is-flashing' : '', justAdded ? 'is-new' : ''].filter(Boolean).join(' ')
            const section = (
              <section
                key={block.id}
                data-block-id={block.id}
                className={classes}
                onPointerDownCapture={() => {
                  ws.select(block.id)
                  // The sources menu belongs to one block; touching another one puts it away.
                  setSourcesFor((v) => (v === block.id ? v : null))
                }}
              >
                {label && (
                  <div className="block-label">
                    <span className="block-label-text">{label}</span>
                    <span className="block-label-rule" />
                    {justAdded && <span className="block-label-new">just added</span>}
                  </div>
                )}
                <BlockBody block={block} autoEdit={autoEdit?.id === block.id && autoEdit.raw === block.raw} />
                {sourceLine(block)}
                {sourcesFor === block.id && <BlockSources block={block} onClose={() => setSourcesFor(null)} />}
                {ws.linkTarget === block.id && (
                  <div className="block-linking">
                    <span>citing into this {block.kind} · open a source and select a passage</span>
                    <button type="button" onClick={() => ws.setLinkTarget(null)}>
                      done
                    </button>
                  </div>
                )}
                <div className="block-actions">
                  <button type="button" className={sourcesFor === block.id || ws.linkTarget === block.id ? 'is-on' : ''} title="the sources this block cites" onClick={() => setSourcesFor((v) => (v === block.id ? null : block.id))}>
                    ⚲
                  </button>
                  <button type="button" title="move up" disabled={index === 0} onClick={() => ws.moveBlock(block.id, index === 0 ? 'start' : { before: ws.blocks[index - 1].id })}>
                    ↑
                  </button>
                  <button type="button" title="move down" disabled={index === ws.blocks.length - 1} onClick={() => ws.moveBlock(block.id, index === ws.blocks.length - 1 ? 'end' : { after: ws.blocks[index + 1].id })}>
                    ↓
                  </button>
                  <button type="button" title="remove" onClick={() => ws.removeBlocks([block.id])}>
                    ×
                  </button>
                </div>
              </section>
            )
            return [...(index === 0 ? [gap(null), ...draftAt('start')] : []), section, gap(block.id), ...draftAt({ after: block.id })]
          })
        )}

        {!ws.rawView && draftAt('end')}
        {!ws.rawView && (
          <>
            {menuOpen === 'sources' && <FromSourcesTray onClose={() => setMenuOpen(null)} onInserted={(block) => setAutoEdit({ id: block.id, raw: block.raw })} />}
            <div className="document-add">
              <FromSourcesButton open={menuOpen === 'sources'} onToggle={() => setMenuOpen((v) => (v === 'sources' ? null : 'sources'))} />
              <button type="button" className="control" onClick={() => setMenuOpen((v) => (v === 'block' ? null : 'block'))}>
                + block
              </button>
              {menuOpen === 'block' && (
                <div className="document-add-menu">
                  <button type="button" className="control" onClick={() => addManual({ kind: 'heading', text: '', level: 2 })}>
                    heading
                  </button>
                  <button type="button" className="control" onClick={() => addManual({ kind: 'paragraph', markdown: '' })}>
                    paragraph
                  </button>
                  <button type="button" className="control" onClick={() => addManual({ kind: 'callout', title: '', body: '', tone: 'idea', cites: [] })}>
                    callout
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

/**
 * The sources of one block: what it cites, each droppable, and what can be added — the passages
 * gathered in the context, or any source of the space as a whole.
 */
function BlockSources({ block, onClose }: { block: ParsedBlock; onClose: () => void }) {
  const ws = useWorkspace()
  const { sources, byId } = useSources()
  const marks = ws.marksOf(block)
  const label = (id: string) => {
    const s = byId(id)
    return (s?.title ?? s?.name ?? 'removed source').replace(/\.[a-z0-9]+$/i, '')
  }

  return (
    <div className="block-sources-menu" onClick={(e) => e.stopPropagation()}>
      <div className="block-sources-head">
        <span className="panel-label">sources of this {block.kind}</span>
        <button type="button" className="block-sources-close" title="close" onClick={onClose}>
          ×
        </button>
      </div>

      {marks.length === 0 ? (
        <div className="block-sources-empty">it cites none yet</div>
      ) : (
        <div className="block-sources-rows">
          {marks.map(({ key, citation: c }, i) => (
            <div key={`${key}:${i}`} className="block-sources-row">
              {c ? (
                <button type="button" className="block-sources-open" onClick={() => ws.openViewer({ sourceId: c.sourceId, page: c.page, citation: c })}>
                  <span className="block-sources-key">[^{key}]</span>
                  <span className="block-sources-name">
                    {label(c.sourceId)}
                    {c.page && byId(c.sourceId)?.kind === 'pdf' ? ` · p.${c.page}` : ''}
                  </span>
                  {c.quote && <span className="block-sources-quote">“{c.quote}”</span>}
                </button>
              ) : (
                <div className="block-sources-open">
                  <span className="block-sources-key">[^{key}]</span>
                  <span className="block-sources-name">no source behind this mark</span>
                </div>
              )}
              <button type="button" className="block-sources-drop" title="drop this source from the block" onClick={() => ws.unlinkSource(block.id, key)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="panel-label block-sources-add">add another passage</div>
      {sources.length === 0 ? (
        <div className="block-sources-empty">no sources in the space yet</div>
      ) : (
        <>
          <button
            type="button"
            className="control control--primary block-sources-link"
            onClick={() => {
              ws.setLinkTarget(block.id)
              if (!ws.viewer && sources[0]) ws.openViewer({ sourceId: sources[0].id })
              onClose()
            }}
          >
            pick one in a source
          </button>
          <div className="block-sources-hint">open a source, select the passage and press “add to the {block.kind}”</div>
        </>
      )}
    </div>
  )
}

/** The whole document as markdown; blur or ⌘Enter saves, Escape reverts. */
function RawEditor() {
  const ws = useWorkspace()
  const [draft, setDraft] = useState(ws.markdown)
  const commit = () => {
    if (draft !== ws.markdown) ws.setMarkdown(draft)
  }
  return (
    <div className="raw-view">
      <div className="raw-head">
        <span className="panel-label">markdown · the whole space</span>
        <button
          type="button"
          className="control control--primary"
          onClick={() => {
            commit()
            ws.setRawView(false)
          }}
        >
          done
        </button>
      </div>
      <textarea
        className="raw-editor"
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') setDraft(ws.markdown)
        }}
      />
    </div>
  )
}
