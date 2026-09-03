import { useEffect, useRef, useState } from 'react'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import { citationsOf, type Block, type BlockContent, type Citation } from '../workspace/types'
import { BlockBody } from './blocks/BlockBody'
import { CollectTray } from './CollectTray'
import './Document.css'
import './blocks/blocks.css'

const JUST_ADDED_MS = 30_000
const FLASH_MS = 1400

const LABELS: Partial<Record<BlockContent['type'], string>> = { callout: 'callout', diagram: 'diagram', comparison: 'comparison', flashcards: 'flashcards', quiz: 'test yourself' }

function labelOf(block: Block): string | null {
  const base = LABELS[block.content.type]
  if (!base) return null
  const c = block.content
  if (c.type === 'flashcards') return `${base} · ${c.cards.length}`
  if (c.type === 'quiz') return `${base} · ${c.questions.length}`
  return base
}

/** The knowledge space: a vertical document of blocks the user and the agent both edit. */
export function Document() {
  const ws = useWorkspace()
  const { byId } = useSources()
  const [now, setNow] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  // The flash after focus_block lives on the last focus key; it fades by CSS.
  const flashId = ws.focusKey && now - ws.focusKey < FLASH_MS ? ws.selectedBlockId : null

  // "just added" badges and the focus flash expire on their own.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 2500)
    return () => window.clearInterval(t)
  }, [])

  // focus_block: scroll to the block.
  useEffect(() => {
    if (!ws.focusKey || !ws.selectedBlockId) return
    const el = pageRef.current?.querySelector<HTMLElement>(`[data-block-id="${ws.selectedBlockId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = window.setTimeout(() => setNow(Date.now()), FLASH_MS + 50)
    return () => window.clearTimeout(t)
  }, [ws.focusKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceLine = (block: Block) => {
    const cites = citationsOf(block)
    if (cites.length === 0) return null
    if (block.content.type === 'paragraph' && /\[\d+\]/.test(block.content.text)) return null
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

  const addManual = (content: BlockContent) => {
    ws.addBlock({ content, by: 'user' }, 'end')
    setMenuOpen(false)
  }


  return (
    <main className="document scroll" onClick={() => ws.select(null)}>
      <div ref={pageRef} className="document-page" onClick={(e) => e.stopPropagation()}>
        {ws.blocks.length === 0 && (
          <div className="document-empty">
            <div className="document-empty-title">This space is empty.</div>
            <div className="document-empty-body">Add sources on the left and ask your agent to explain them — or gather passages yourself and turn them into a block.</div>
          </div>
        )}

        {ws.blocks.map((block, index) => {
          const label = labelOf(block)
          const justAdded = block.by === 'agent' && now - block.createdAt < JUST_ADDED_MS
          const selected = ws.selectedBlockId === block.id
          const className = ['block', `block--${block.content.type}`, selected ? 'is-selected' : '', flashId === block.id ? 'is-flashing' : '', justAdded ? 'is-new' : ''].filter(Boolean).join(' ')
          return (
            <section key={block.id} data-block-id={block.id} className={className} onPointerDownCapture={() => ws.select(block.id)}>
              {label && (
                <div className="block-label">
                  <span className="block-label-text">{label}</span>
                  <span className="block-label-rule" />
                  {justAdded && <span className="block-label-new">just added</span>}
                </div>
              )}
              <BlockBody block={block} />
              {sourceLine(block)}
              <div className="block-actions">
                <button type="button" onClick={() => ws.moveBlock(block.id, index === 0 ? 'start' : { before: ws.blocks[index - 1].id })} disabled={index === 0} title="move up">
                  ↑
                </button>
                <button type="button" onClick={() => ws.moveBlock(block.id, index === ws.blocks.length - 1 ? 'end' : { after: ws.blocks[index + 1].id })} disabled={index === ws.blocks.length - 1} title="move down">
                  ↓
                </button>
                {block.content.type !== 'heading' && (
                  <button type="button" className={ws.collectTarget === block.id ? 'is-on' : ''} onClick={() => (ws.collectTarget === block.id ? ws.stopCollecting() : ws.startCollecting(block.id))} title="gather passages from the sources for this block">
                    ⚲
                  </button>
                )}
                <button type="button" onClick={() => ws.removeBlocks([block.id])} title="remove block">
                  ×
                </button>
              </div>
            </section>
          )
        })}

        <CollectTray />

        <div className="document-add">
          <button type="button" className={`control${ws.collecting ? '' : ' control--primary'}`} onClick={() => (ws.collecting ? ws.stopCollecting() : ws.startCollecting())} title="gather passages from the sources, then turn them into a block">
            {ws.collecting ? 'stop collecting' : '+ from sources'}
          </button>
          <button type="button" className="control" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
            + block
          </button>
          {menuOpen && (
            <div className="document-add-menu">
              <button type="button" className="control" onClick={() => addManual({ type: 'heading', text: '', level: 2 })}>
                heading
              </button>
              <button type="button" className="control" onClick={() => addManual({ type: 'paragraph', text: '' })}>
                paragraph
              </button>
              <button type="button" className="control" onClick={() => addManual({ type: 'callout', title: '', body: '', tone: 'idea' })}>
                callout
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
