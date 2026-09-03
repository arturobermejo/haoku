import { marks } from '../workspace/markdown/citations'
import { blockToMarkdown } from '../workspace/markdown/serialize'
import type { BlockData } from '../workspace/markdown/types'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'
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
  const position = target ? { after: target.id } : selected ? { after: selected.id } : 'end'

  /** Builds the block once the passages have footnote keys; `keys[i]` belongs to `passages[i]`. */
  const make = (build: (keys: string[], keyOf: (c: Citation) => string) => BlockData | string) => {
    ws.insertBlock(
      (keys) => {
        const keyOf = (c: Citation) => keys[passages.indexOf(c)]
        const out = build(keys, keyOf)
        return typeof out === 'string' ? out : blockToMarkdown(out)
      },
      position,
      passages,
      'user',
    )
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
        <span className="tray-label">{target ? `collecting passages for ${target.kind}` : 'collecting passages'} · open a source, select text, press “collect”</span>
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
                <button type="button" className="passage-remove" onClick={() => ws.uncollect(i)} title="drop this passage">
                  ×
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="tray-empty">nothing gathered yet</div>
      )}

      <div className="tray-actions">
        {(target ?? selected) && (
          <button type="button" className="control control--primary" disabled={!has} onClick={link}>
            link to {(target ?? selected)!.kind}
          </button>
        )}
        <span className="tray-make">make</span>
        <button type="button" className="control" disabled={!has} onClick={() => make((keys) => (textual.length ? `${marks(keys.filter((_, i) => byId(passages[i].sourceId)?.kind !== 'image'))}` : ''))}>
          paragraph
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make((keys) => ({ kind: 'callout', tone: 'idea', title: '', body: '', cites: keys }))}>
          callout
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make((_keys, keyOf) => ({ kind: 'flashcards', cards: textual.map((c) => ({ question: '', answer: c.quote ?? '', cite: keyOf(c) })), cites: [] }))}>
          flashcards
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make((_keys, keyOf) => ({ kind: 'diagram', title: '', nodes: textual.map((c) => ({ label: short(c), cite: keyOf(c) })), edges: [], cites: [] }))}>
          diagram
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make((keys) => ({ kind: 'quiz', questions: textual.map((c) => ({ prompt: '', options: ['', ''], answer: 0, explanation: c.quote })), cites: keys }))}>
          quiz
        </button>
        {images.length > 0 && (
          <button type="button" className="control" onClick={() => make(() => ({ kind: 'image', sourceId: images[0].sourceId, caption: '' }))}>
            image
          </button>
        )}
      </div>
      <div className="tray-hint">or ask your agent — it sees what you gathered</div>
    </div>
  )
}
