import { useSyncExternalStore } from 'react'
import { getActivity, subscribeActivity } from '../tools/webmcp'
import { sections } from '../workspace/coverage'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import { blockExcerpt, CALLOUT_META, citationsOf, type Block, type Citation } from '../workspace/types'
import './ContextPanel.css'

function blockTitle(block: Block): string {
  const c = block.content
  switch (c.type) {
    case 'heading':
      return c.text
    case 'callout':
      return c.title || CALLOUT_META[c.tone].label
    case 'diagram':
    case 'comparison':
      return c.title || blockExcerpt(block, 60)
    case 'paragraph':
      return blockExcerpt(block, 70)
    case 'flashcards':
      return `${c.cards.length} flashcards`
    case 'quiz':
      return `${c.questions.length}-question quiz`
    case 'image':
      return c.caption || 'image'
  }
}

export function ContextPanel() {
  const ws = useWorkspace()
  const sourcesApi = useSources()
  const activity = useSyncExternalStore(subscribeActivity, getActivity)
  const block = ws.selectedBlockId ? ws.blocks.find((b) => b.id === ws.selectedBlockId) : undefined

  const cites: Citation[] = block ? citationsOf(block) : []
  const recent = [...activity.running.map((r) => ({ ...r, pending: true })), ...activity.finished.map((r) => ({ ...r, pending: false }))].slice(0, 5)
  const covered = sections(ws.blocks, ws.quizAnswers)

  return (
    <aside className="panel panel--right context-panel scroll">
      <div className="context-head">
        <span className="panel-label">context</span>
        <span className="panel-label context-kind">{block ? block.content.type : 'workspace'}</span>
      </div>

      {block ? (
        <>
          <div className="context-card">
            <div className="context-card-title">{blockTitle(block)}</div>
            {block.content.type !== 'heading' && <div className="context-card-body">{blockExcerpt(block, 220)}</div>}
            <div className="context-card-meta">
              {block.by === 'agent' ? 'added by the agent' : 'written by you'} · {new Date(block.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          <div className="panel-label context-section">{cites.some((c) => c.quote) ? `passages this ${block.content.type} draws on` : 'sources'}</div>
          {cites.length === 0 ? (
            <div className="context-empty">no source cited</div>
          ) : (
            <div className="context-sources">
              {cites.map((c, i) => {
                const source = sourcesApi.byId(c.sourceId)
                return (
                  <button key={i} type="button" className="context-source" onClick={() => ws.openViewer({ sourceId: c.sourceId, page: c.page, citation: c })}>
                    <span className="context-source-name">
                      {block.content.type === 'paragraph' ? `[${i + 1}] ` : `${i + 1} · `}
                      {source?.title ?? source?.name ?? 'removed source'}
                    </span>
                    <span className="context-source-where">{c.page ? `p.${c.page}` : (source?.kind ?? '')}</span>
                    {c.quote && <span className="context-source-quote">“{c.quote}”</span>}
                    <span className="context-source-open">open →</span>
                  </button>
                )
              })}
            </div>
          )}

          {block.note && (
            <>
              <div className="panel-label context-section">agent note</div>
              <div className="context-note">{block.note}</div>
            </>
          )}
        </>
      ) : (
        <div className="context-card">
          <div className="context-card-title">{ws.title}</div>
          <div className="context-card-body">
            {sourcesApi.sources.length} source{sourcesApi.sources.length === 1 ? '' : 's'} · {ws.blocks.length} block{ws.blocks.length === 1 ? '' : 's'}
            {covered.length > 0 && ` · ${covered.filter((s) => s.status === 'done').length}/${covered.length} sections covered`}
          </div>
          <div className="context-card-meta">select a block to see where it comes from</div>
        </div>
      )}

      <div className="panel-label context-section">recent tool calls</div>
      {recent.length === 0 ? (
        <div className="context-empty">none yet</div>
      ) : (
        <div className="context-calls">
          {recent.map((r) => (
            <div key={r.id} className={`context-call${r.pending ? ' is-pending' : r.ok === false ? ' is-failed' : ''}`} title={r.summary}>
              <span className="context-call-dot" />
              <span className="context-call-name">
                {r.name}
                {r.detail !== undefined && <span className="context-call-arg">({JSON.stringify(r.detail)})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
