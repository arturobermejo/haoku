import { marks } from '../workspace/markdown/citations'
import { blockToMarkdown } from '../workspace/markdown/serialize'
import type { BlockData, ParsedBlock } from '../workspace/markdown/types'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'
import './FromSources.css'

/** The "+ from sources" button: opens the tray with the passages gathered in the context. */
export function FromSourcesButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const ws = useWorkspace()
  const n = ws.collected.length
  return (
    <button type="button" className={`control${n > 0 && !open ? ' control--primary' : ''}`} title="turn the passages gathered in the context into a block" onClick={onToggle}>
      {open ? 'close' : `+ from sources${n > 0 ? ` · ${n}` : ''}`}
    </button>
  )
}

/**
 * The tray: what the passages gathered in the context can become — a block of any kind, or citations
 * linked to the selected block. The passages themselves are listed in the context panel; using them clears them.
 */
export function FromSourcesTray({ onClose, onInserted }: { onClose: () => void; onInserted: (block: ParsedBlock) => void }) {
  const ws = useWorkspace()
  const { byId } = useSources()
  const passages = ws.collected
  const has = passages.length > 0
  const selected = ws.selectedBlockId ? ws.blockById(ws.selectedBlockId) : undefined
  const target = selected && selected.kind !== 'heading' ? selected : undefined
  const images = passages.filter((c) => byId(c.sourceId)?.kind === 'image')
  const textual = passages.filter((c) => byId(c.sourceId)?.kind !== 'image')
  const short = (c: Citation) => (c.quote ? (c.quote.length > 60 ? `${c.quote.slice(0, 60)}…` : c.quote) : (byId(c.sourceId)?.name ?? ''))
  const position = selected ? { after: selected.id } : 'end'

  /** Builds the block once the passages have footnote keys; `keys[i]` belongs to `passages[i]`. */
  const make = (build: (keys: string[], keyOf: (c: Citation) => string) => BlockData | string) => {
    const [block] = ws.insertBlock(
      (keys) => {
        const keyOf = (c: Citation) => keys[passages.indexOf(c)]
        const out = build(keys, keyOf)
        return typeof out === 'string' ? out : blockToMarkdown(out)
      },
      position,
      passages,
      'user',
    )
    ws.clearCollected()
    if (block) onInserted(block)
    onClose()
  }
  const link = () => {
    if (!target) return
    ws.linkSources(target.id, passages)
    ws.clearCollected()
    onClose()
  }

  return (
    <div className="tray" onClick={(e) => e.stopPropagation()}>
      <div className="tray-head">
        <span className="tray-label">{has ? `${passages.length} passage${passages.length === 1 ? '' : 's'} in context — see the context panel` : 'nothing in context yet · open a source, select text, press “add to context”'}</span>
        <button type="button" className="tray-close" onClick={onClose} title="close">
          ×
        </button>
      </div>

      <div className="tray-actions">
        {target && (
          <button type="button" className="control control--primary" disabled={!has} onClick={link}>
            link to {target.kind}
          </button>
        )}
        <span className="tray-make">make</span>
        <button type="button" className="control" disabled={!has} onClick={() => make((keys) => (textual.length ? `${marks(keys.filter((_, i) => byId(passages[i].sourceId)?.kind !== 'image'))}` : ''))}>
          paragraph
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make((keys) => ({ kind: 'callout', tone: 'idea', title: '', body: '', cites: keys }))}>
          callout
        </button>
        <button type="button" className="control" disabled={!has} onClick={() => make((_keys, keyOf) => ({ kind: 'diagram', title: '', nodes: textual.map((c) => ({ label: short(c), cite: keyOf(c) })), edges: [], cites: [] }))}>
          diagram
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
