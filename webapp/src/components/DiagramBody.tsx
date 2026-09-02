import { useAugmentations } from '../augment/store'
import type { DiagramAug } from '../augment/types'
import { EditableText } from './EditableText'
import { useWorkspace } from './workspaceContext'

/** A vertical flow of anchored nodes; every node jumps back to its region of the document. */
export function DiagramBody({ item }: { item: DiagramAug }) {
  const aug = useAugmentations()
  const { jumpTo } = useWorkspace()

  const setNodeLabel = (nodeId: string, label: string) =>
    aug.update(item.id, (i) => (i.type === 'diagram' ? { ...i, nodes: i.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)) } : i))
  const setEdgeLabel = (from: string, to: string, label: string) =>
    aug.update(item.id, (i) => (i.type === 'diagram' ? { ...i, edges: i.edges.map((e) => (e.from === from && e.to === to ? { ...e, label: label || undefined } : e)) } : i))
  const removeNode = (nodeId: string) =>
    aug.update(item.id, (i) => {
      if (i.type !== 'diagram') return i
      const nodes = i.nodes.filter((n) => n.id !== nodeId)
      const edges = i.edges.filter((e) => e.from !== nodeId && e.to !== nodeId)
      return { ...i, nodes, edges }
    })

  return (
    <div className="diagram">
      {item.nodes.map((node, index) => {
        const next = item.nodes[index + 1]
        const edge = next ? item.edges.find((e) => e.from === node.id && e.to === next.id) : undefined
        return (
          <div key={node.id} className="diagram-step">
            <div className="diagram-node">
              <EditableText value={node.label} placeholder="node label" className="diagram-node-label" onChange={(label) => setNodeLabel(node.id, label)} />
              <button type="button" className="diagram-node-source" onClick={() => jumpTo(node.anchor)} title={node.anchor.text}>
                p.{node.anchor.page} →
              </button>
              <button type="button" className="diagram-node-remove" onClick={() => removeNode(node.id)} title="remove node">
                ×
              </button>
            </div>
            {next && (
              <div className="diagram-arrow">
                <span className="diagram-arrow-line" />
                <EditableText value={edge?.label ?? ''} placeholder="↓" className="diagram-edge-label" onChange={(label) => setEdgeLabel(node.id, next.id, label)} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
