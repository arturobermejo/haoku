import { ensureMarks } from '../workspace/linking'
import { newId } from '../workspace/ids'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { BlockContent, Citation } from '../workspace/types'
import './CollectTray.css'

/**
 * The basket of passages gathered from the sources. From here they become a
 * block of any kind, or get linked to the block they were collected for.
 */
export function CollectTray() {
  const ws = useWorkspace()
  const { byId } = useSources()
  if (!ws.collecting) return null

  const passages = ws.collected
  const target = ws.collectTarget ? ws.blockById(ws.collectTarget) : undefined
  const selected = !target && ws.selectedBlockId ? ws.blockById(ws.selectedBlockId) : undefined
  const images = passages.filter((c) => byId(c.sourceId)?.kind === 'image')
  const textual = passages.filter((c) => byId(c.sourceId)?.kind !== 'image')
  const short = (c: Citation) => (c.quote ? (c.quote.length > 60 ? `${c.quote.slice(0, 60)}…` : c.quote) : (byId(c.sourceId)?.name ?? ''))

  const make = (content: BlockContent, marks = false) => {
    const position = target ? { after: target.id } : selected ? { after: selected.id } : 'end'
    const block = ws.addBlock({ content, citations: content.type === 'image' ? [] : passages, by: 'user' }, position)
    if (marks) ws.updateBlock(block.id, ensureMarks)
    ws.stopCollecting()
  }
  const link = () => {
    const to = target ?? selected
    if (!to) return
    ws.linkSources(to.id, passages)
    ws.stopCollecting()
  }

  const has = passages.length > 0
  return (
    <div className="tray" onClick={(e) => e.stopPropagation()}>
      <div className="tray-head">
        <span className="tray-label">
          {target ? `collecting passages for ${target.content.type}` : 'collecting passages'} · open a source, select text, press “collect”
        </span>
        <button type="button" className="tray-close" onClick={ws.stopCollecting} title="stop collecting">
          ×
        </button>
      </div>

      {has ? (
        <div className="passages">
          {passages.map((c, i) => {
            const source = byId(c.sourceId)
            return (
              <div key={i} className="passage">
                <button type="button" className="passage-open" onClick={() => ws.openViewer({ sourceId: c.sourceId, page: c.page, citation: c })}>
                  <span className="passage-source">
                    {i + 1} · {(source?.title ?? source?.name ?? 'removed').replace(/\.[a-z0-9]+$/i, '')}
                    {c.page ? ` · p.${c.page}` : ''}
                    {source?.kind === 'image' ? ' · image' : ''}
                  </span>
                  {c.quote && <span className="passage-quote">“{c.quote}”</span>}
                </button>
                <button type="button" className="passage-remove" onClick={() => ws.uncollect(i)} title="drop passage">
                  ×
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="collecting-empty">nothing gathered yet</div>
      )}

      <div className="tray-actions">
        <span className="tray-actions-label">{target || selected ? 'link to' : 'make'}</span>
        {(target || selected) && (
          <button type="button" className="control control--primary" disabled={!has} onClick={link}>
            {target?.content.type ?? selected?.content.type}
          </button>
        )}
        {(target || selected) && <span className="tray-actions-label">or make</span>}
        <button type="button" className="control" disabled={!has} onClick={() => make({ type: 'paragraph', text: '' }, true)}>
          paragraph
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make({ type: 'callout', title: '', body: '', tone: 'idea' })}>
          callout
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make({ type: 'flashcards', cards: textual.map((c) => ({ id: newId('c'), question: '', answer: c.quote ?? '', citation: c })) })}>
          flashcards
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make({ type: 'diagram', title: '', nodes: textual.map((c) => ({ id: newId('n'), label: short(c), citation: c })), edges: [] })}>
          diagram
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make({ type: 'quiz', questions: textual.map((c) => ({ id: newId('q'), prompt: '', options: ['', ''], answer: 0, explanation: c.quote })) })}>
          quiz
        </button>
        {images.length > 0 && (
          <button type="button" className="control" onClick={() => make({ type: 'image', sourceId: images[0].sourceId, caption: '' })}>
            image
          </button>
        )}
        <span className="tray-hint">or ask your agent — it sees what you gathered</span>
      </div>
    </div>
  )
}
