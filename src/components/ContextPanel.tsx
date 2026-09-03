import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'
import { ConfirmDialog } from './ConfirmDialog'
import './ContextPanel.css'

/**
 * Context: the passages gathered from the sources (waiting to become a block with "+ from sources"),
 * and, under them, the passages the selected block draws on. A gathered passage is dragged onto that
 * lower list to cite it in the block.
 */
export function ContextPanel() {
  const ws = useWorkspace()
  const sourcesApi = useSources()
  const [over, setOver] = useState(false)
  const [pending, setPending] = useState<{ index: number; citation: Citation } | null>(null)
  const blockRef = useRef<HTMLDivElement>(null)
  const block = ws.selectedBlockId ? ws.blocks.find((b) => b.id === ws.selectedBlockId) : undefined
  const marks = block ? ws.marksOf(block) : []
  const gathered = ws.collected
  // Selecting a block puts its passages on screen: the gathered list above can be long. The section is
  // keyed by the block, so it remounts and its highlight animation replays on every new selection.
  useEffect(() => {
    if (!ws.selectedBlockId) return
    blockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [ws.selectedBlockId])

  const label = (c: Citation) => {
    const source = sourcesApi.byId(c.sourceId)
    return source?.title ?? source?.name ?? 'removed source'
  }

  /** A mark whose footnote is gone: the block still points at it, so it is shown rather than dropped. */
  const dangling = (key: string, onRemove: () => void) => (
    <div className="context-source-row">
      <div className="context-source context-source--dangling">
        <span className="context-source-name">[^{key}]</span>
        <span className="context-source-where">no source behind this mark</span>
      </div>
      <button type="button" className="context-source-unlink" title="remove this mark" onClick={onRemove}>
        ×
      </button>
    </div>
  )

  const passage = (c: Citation, key: string | null, onRemove: () => void, removeTitle: string, drag?: (event: DragEvent) => void) => {
    const source = sourcesApi.byId(c.sourceId)
    return (
      <div className={`context-source-row${drag ? ' is-draggable' : ''}`} draggable={drag !== undefined} onDragStart={drag} onDragEnd={() => setOver(false)}>
        <button type="button" className="context-source" onClick={() => ws.openViewer({ sourceId: c.sourceId, page: c.page, citation: c })}>
          <span className="context-source-name">
            {key ? `[^${key}] ` : ''}
            {label(c)}
          </span>
          <span className="context-source-where">{c.page && source?.kind === 'pdf' ? `p.${c.page}` : (source?.kind ?? '')}</span>
          {c.quote && <span className="context-source-quote">“{c.quote}”</span>}
          <span className="context-source-open">open →</span>
        </button>
        <button type="button" className="context-source-unlink" title={removeTitle} onClick={onRemove}>
          ×
        </button>
      </div>
    )
  }

  /** The lower list takes a gathered passage; the drop only asks, the dialog does it. */
  const dropZone = (children: React.ReactNode) => (
    <div
      key={ws.selectedBlockId ?? 'none'}
      ref={blockRef}
      className={`context-drop is-fresh${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-haoku-passage')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'link'
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const index = Number(e.dataTransfer.getData('application/x-haoku-passage'))
        const citation = ws.collected[index]
        if (Number.isInteger(index) && citation) setPending({ index, citation })
      }}
    >
      {children}
    </div>
  )

  return (
    <aside className="panel panel--right context-panel scroll">
      <div className="context-head">
        <span className="panel-label">context</span>
        <span className="panel-label context-kind">{gathered.length > 0 ? `${gathered.length} gathered` : block ? block.kind : 'workspace'}</span>
      </div>

      <div className="context-gathered">
        <div className="context-section-head">
          <span className="panel-label">gathered from the sources</span>
          {gathered.length > 0 && (
            <button type="button" className="context-clear" onClick={ws.clearCollected}>
              clear
            </button>
          )}
        </div>
        {gathered.length === 0 ? (
          <div className="context-empty">open a source, select text and press “add to context”</div>
        ) : (
          <>
            <div className="context-sources">
              {gathered.map((c, i) => (
                <div key={i}>
                  {passage(c, null, () => ws.uncollect(i), 'drop this passage', (event) => {
                    event.dataTransfer.setData('application/x-haoku-passage', String(i))
                    event.dataTransfer.effectAllowed = 'link'
                  })}
                </div>
              ))}
            </div>
            <div className="context-hint">“+ from sources” under the document turns these into a paragraph, callout, diagram or table{block ? `, or drag one onto the ${block.kind} below to cite it there` : ''}.</div>
          </>
        )}
      </div>

      {block &&
        dropZone(
          <>
            <div className="panel-label context-section">
              {marks.some((m) => m.citation?.quote) ? `passages this ${block.kind} draws on` : `sources of this ${block.kind}`}
              {gathered.length > 0 && <span className="context-drop-note"> · drop one here</span>}
            </div>
            {marks.length === 0 ? (
              <div className="context-empty">this {block.kind} cites no source yet</div>
            ) : (
              <div className="context-sources">
                {marks.map((m, i) => (
                  <div key={`${m.key}:${i}`}>{m.citation ? passage(m.citation, m.key, () => ws.unlinkSource(block.id, m.key), 'unlink this passage') : dangling(m.key, () => ws.unlinkSource(block.id, m.key))}</div>
                ))}
              </div>
            )}
          </>,
        )}

      {pending && block && (
        <ConfirmDialog
          title={`Cite this passage in the ${block.kind}?`}
          body={`${pending.citation.quote ? `“${pending.citation.quote.length > 160 ? `${pending.citation.quote.slice(0, 160)}…` : pending.citation.quote}” — ` : ''}${label(pending.citation)}. It leaves the gathered list and becomes a footnote of the ${block.kind}.`}
          confirmLabel="cite it"
          onConfirm={() => {
            ws.linkSources(block.id, [pending.citation])
            ws.uncollect(pending.index)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </aside>
  )
}
