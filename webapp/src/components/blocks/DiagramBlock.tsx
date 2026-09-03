import { useSources } from '../../workspace/sources'
import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'diagram' }>

/** A vertical flow of nodes; a node with a citation jumps back to its passage. */
export function DiagramBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  const { byId } = useSources()
  const set = (patch: Partial<Content>) => ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, ...patch } }))

  return (
    <div className="diagram-block">
      <EditableText value={content.title} placeholder="diagram title" className="block-title" onChange={(title) => set({ title })} />
      <div className="diagram">
        {content.nodes.map((node, index) => {
          const next = content.nodes[index + 1]
          const edge = next ? content.edges.find((e) => e.from === node.id && e.to === next.id) : undefined
          const source = node.citation ? byId(node.citation.sourceId) : undefined
          return (
            <div key={node.id} className="diagram-step">
              <div className="diagram-node">
                <EditableText value={node.label} placeholder="node" className="diagram-node-label" onChange={(label) => set({ nodes: content.nodes.map((n) => (n.id === node.id ? { ...n, label } : n)) })} />
                {node.citation && (
                  <button type="button" className="diagram-node-source" onClick={() => ws.openViewer({ sourceId: node.citation!.sourceId, page: node.citation!.page, citation: node.citation })} title={source?.name}>
                    {node.citation.page ? `p.${node.citation.page}` : (source?.name ?? 'source')} →
                  </button>
                )}
              </div>
              {next && (
                <div className="diagram-arrow">
                  <span className="diagram-arrow-line" />
                  <EditableText
                    value={edge?.label ?? ''}
                    placeholder="↓"
                    className="diagram-edge-label"
                    onChange={(label) =>
                      set({
                        edges: edge
                          ? content.edges.map((e) => (e === edge ? { ...e, label: label || undefined } : e))
                          : [...content.edges, { from: node.id, to: next.id, ...(label ? { label } : {}) }],
                      })
                    }
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
