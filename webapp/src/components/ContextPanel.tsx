import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import './ContextPanel.css'

/** Where the selected block comes from: nothing but the passages it cites. */
export function ContextPanel() {
  const ws = useWorkspace()
  const sourcesApi = useSources()
  const block = ws.selectedBlockId ? ws.blocks.find((b) => b.id === ws.selectedBlockId) : undefined
  const cites = block ? ws.citationsOf(block) : []

  return (
    <aside className="panel panel--right context-panel scroll">
      <div className="context-head">
        <span className="panel-label">context</span>
        <span className="panel-label context-kind">{block ? block.kind : 'workspace'}</span>
      </div>

      {block ? (
        <>
          <div className="panel-label context-section">{cites.some((c) => c.quote) ? `passages this ${block.kind} draws on` : 'sources'}</div>
          {cites.length === 0 ? (
            <div className="context-empty">this {block.kind} cites no source yet</div>
          ) : (
            <div className="context-sources">
              {cites.map((c, i) => {
                const source = sourcesApi.byId(c.sourceId)
                const key = block.citationKeys[i]
                return (
                  <div key={i} className="context-source-row">
                    <button type="button" className="context-source" onClick={() => ws.openViewer({ sourceId: c.sourceId, page: c.page, citation: c })}>
                      <span className="context-source-name">
                        [^{key}] {source?.title ?? source?.name ?? 'removed source'}
                      </span>
                      <span className="context-source-where">{c.page && source?.kind === 'pdf' ? `p.${c.page}` : (source?.kind ?? '')}</span>
                      {c.quote && <span className="context-source-quote">“{c.quote}”</span>}
                      <span className="context-source-open">open →</span>
                    </button>
                    <button type="button" className="context-source-unlink" title="unlink this passage" onClick={() => ws.unlinkSource(block.id, key)}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div className="context-empty">select a block to see the passages it draws on</div>
      )}
    </aside>
  )
}
