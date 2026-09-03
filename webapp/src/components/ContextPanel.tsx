import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'
import './ContextPanel.css'

/**
 * Context: the passages gathered from the sources (waiting to become a block with "+ from sources"),
 * and, under them, the passages the selected block draws on.
 */
export function ContextPanel() {
  const ws = useWorkspace()
  const sourcesApi = useSources()
  const block = ws.selectedBlockId ? ws.blocks.find((b) => b.id === ws.selectedBlockId) : undefined
  const cites = block ? ws.citationsOf(block) : []
  const gathered = ws.collected

  const passage = (c: Citation, key: string | null, onRemove: () => void, removeTitle: string) => {
    const source = sourcesApi.byId(c.sourceId)
    return (
      <div className="context-source-row">
        <button type="button" className="context-source" onClick={() => ws.openViewer({ sourceId: c.sourceId, page: c.page, citation: c })}>
          <span className="context-source-name">
            {key ? `[^${key}] ` : ''}
            {source?.title ?? source?.name ?? 'removed source'}
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
                <div key={i}>{passage(c, null, () => ws.uncollect(i), 'drop this passage')}</div>
              ))}
            </div>
            <div className="context-hint">“+ from sources” under the document turns these into a paragraph, callout, diagram or table{block && block.kind !== 'heading' ? `, or links them to the selected ${block.kind}` : ''}.</div>
          </>
        )}
      </div>

      {block && (
        <>
          <div className="panel-label context-section">{cites.some((c) => c.quote) ? `passages this ${block.kind} draws on` : `sources of this ${block.kind}`}</div>
          {cites.length === 0 ? (
            <div className="context-empty">this {block.kind} cites no source yet</div>
          ) : (
            <div className="context-sources">
              {cites.map((c, i) => (
                <div key={i}>{passage(c, block.citationKeys[i], () => ws.unlinkSource(block.id, block.citationKeys[i]), 'unlink this passage')}</div>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  )
}
