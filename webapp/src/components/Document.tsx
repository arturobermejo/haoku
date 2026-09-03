import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { blockLabel } from '../workspace/markdown/excerpt'
import { blockToMarkdown } from '../workspace/markdown/serialize'
import type { BlockData, ParsedBlock } from '../workspace/markdown/types'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'
import { BlockBody } from './blocks/BlockBody'
import { CollectTray } from './CollectTray'
import './Document.css'
import './blocks/blocks.css'

const JUST_ADDED_MS = 30_000
const FLASH_MS = 1400

/** The knowledge space: a markdown document shown as blocks the user and the agent both edit. */
export function Document() {
  const ws = useWorkspace()
  const { byId } = useSources()
  const [now, setNow] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const [autoEditId, setAutoEditId] = useState<string | null>(null)
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
    const onAnswer = (e: Event) => {
      const id = blockOf(e)
      const { question, option } = (e as CustomEvent<{ question: number; option: number }>).detail
      if (id) ws.answerQuiz(id, question, option)
    }
    const onReveal = (e: Event) => {
      const id = blockOf(e)
      const { card, revealed } = (e as CustomEvent<{ card: number; revealed: boolean }>).detail
      if (id) ws.reveal(id, card, revealed)
    }
    const onCite = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail.key
      const citation = ws.getState().footnotes.get(key)
      if (citation) ws.openViewer({ sourceId: citation.sourceId, page: citation.page, citation })
    }
    page.addEventListener('space-change', onChange)
    page.addEventListener('space-answer', onAnswer)
    page.addEventListener('space-reveal', onReveal)
    page.addEventListener('space-cite', onCite)
    return () => {
      page.removeEventListener('space-change', onChange)
      page.removeEventListener('space-answer', onAnswer)
      page.removeEventListener('space-reveal', onReveal)
      page.removeEventListener('space-cite', onCite)
    }
  }, [ws])

  // Citation marks and images inside rendered markdown open the source; caught before the editor sees the click.
  const onClickCapture = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement
    const mark = target.closest<HTMLElement>('.cite[data-key]')
    if (mark && !target.closest('space-callout, space-diagram, space-flashcards, space-quiz')) {
      const citation = ws.footnotes.get(mark.dataset.key ?? '')
      e.preventDefault()
      e.stopPropagation()
      if (citation) ws.openViewer({ sourceId: citation.sourceId, page: citation.page, citation })
      return
    }
    const img = target.closest<HTMLImageElement>('img[data-source-id]')
    if (img) {
      e.preventDefault()
      e.stopPropagation()
      ws.openViewer({ sourceId: img.dataset.sourceId! })
    }
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

  const addManual = (data: BlockData) => {
    const [block] = ws.insertBlock(blockToMarkdown(data), 'end')
    if (block) setAutoEditId(block.id)
    setMenuOpen(false)
  }

  return (
    <main className="document scroll" onClick={() => ws.select(null)}>
      <div ref={pageRef} className="document-page" onClick={(e) => e.stopPropagation()} onClickCapture={onClickCapture}>
        {ws.rawView ? (
          <RawEditor />
        ) : ws.blocks.length === 0 ? (
          <div className="document-empty">
            <div className="document-empty-title">This space is empty.</div>
            <div className="document-empty-body">Add sources on the left and ask your agent to explain them — or gather passages yourself and turn them into a block.</div>
          </div>
        ) : (
          ws.blocks.map((block, index) => {
            const meta = ws.blockMeta[block.id]
            const justAdded = meta?.by === 'agent' && now - meta.createdAt < JUST_ADDED_MS
            const label = blockLabel(block)
            const classes = ['block', `block--${block.kind}`, ws.selectedBlockId === block.id ? 'is-selected' : '', flashId === block.id ? 'is-flashing' : '', justAdded ? 'is-new' : ''].filter(Boolean).join(' ')
            return (
              <section key={block.id} data-block-id={block.id} className={classes} onPointerDownCapture={() => ws.select(block.id)}>
                {label && (
                  <div className="block-label">
                    <span className="block-label-text">{label}</span>
                    <span className="block-label-rule" />
                    {justAdded && <span className="block-label-new">just added</span>}
                  </div>
                )}
                <BlockBody block={block} autoEdit={autoEditId === block.id && block.raw.replace(/^#{1,3}\s*/, '') === ''} />
                {sourceLine(block)}
                <div className="block-actions">
                  <button type="button" title="move up" disabled={index === 0} onClick={() => ws.moveBlock(block.id, index === 0 ? 'start' : { before: ws.blocks[index - 1].id })}>
                    ↑
                  </button>
                  <button type="button" title="move down" disabled={index === ws.blocks.length - 1} onClick={() => ws.moveBlock(block.id, index === ws.blocks.length - 1 ? 'end' : { after: ws.blocks[index + 1].id })}>
                    ↓
                  </button>
                  {block.kind !== 'heading' && (
                    <button type="button" className={ws.collectTarget === block.id ? 'is-on' : ''} title="gather passages from the sources for this block" onClick={() => (ws.collectTarget === block.id ? ws.stopCollecting() : ws.startCollecting(block.id))}>
                      ⚲
                    </button>
                  )}
                  <button type="button" title="remove" onClick={() => ws.removeBlocks([block.id])}>
                    ×
                  </button>
                </div>
              </section>
            )
          })
        )}

        {!ws.rawView && (
          <>
            <CollectTray />
            <div className="document-add">
              <button type="button" className={`control${ws.collecting ? '' : ' control--primary'}`} title="gather passages from the sources, then turn them into a block" onClick={() => (ws.collecting ? ws.stopCollecting() : ws.startCollecting())}>
                {ws.collecting ? 'stop collecting' : '+ from sources'}
              </button>
              <button type="button" className="control" onClick={() => setMenuOpen((v) => !v)}>
                + block
              </button>
              {menuOpen && (
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
