import { arr, button, el, num, SpaceElement, str } from './base'
import { editable, inline } from './editable'

export interface DiagramData {
  title: string
  nodes: { label: string; cite?: string }[]
  /** 0-based node indexes. */
  edges: { from: number; to: number; label?: string }[]
}

/** <space-diagram title="…">{"nodes":[…],"edges":[…]}</space-diagram> — a vertical flow of nodes. */
export class SpaceDiagram extends SpaceElement<DiagramData> {
  protected parseSource(): DiagramData {
    const json = this.jsonSource() ?? {}
    const nodes = arr(json.nodes).map((n) => ({ label: str(n.label), ...(str(n.cite) ? { cite: str(n.cite) } : {}) }))
    const edges = arr(json.edges)
      .map((e) => ({ from: num(e.from, -1), to: num(e.to, -1), ...(str(e.label) ? { label: str(e.label) } : {}) }))
      .filter((e) => e.from >= 0 && e.to >= 0 && e.from < nodes.length && e.to < nodes.length)
    return { title: this.getAttribute('title') ?? '', nodes, edges }
  }

  protected renderInto(root: HTMLElement) {
    const d = this.data
    const title = this.isEditable && this.hasAttribute('title') ? (this.getAttribute('title') ?? '') : d.title
    root.className = 'space-root diagram-block'
    if (this.isEditable) root.append(editable({ value: title, placeholder: 'diagram title', className: 'block-title', onCommit: (t) => this.change({ ...this.data, title: t }) }))
    else if (title) root.append(inline(title, 'block-title'))
    const flow = el('div', 'diagram')
    d.nodes.forEach((node, index) => {
      const next = d.nodes[index + 1]
      const edge = next ? d.edges.find((e) => e.from === index && e.to === index + 1) : undefined
      const step = el('div', 'diagram-step')
      const box = el('div', 'diagram-node')
      if (this.isEditable) box.append(editable({ value: node.label, placeholder: 'node', className: 'diagram-node-label', onCommit: (label) => this.change({ ...this.data, nodes: this.data.nodes.map((n, i) => (i === index ? { ...n, label } : n)) }) }))
      else box.append(inline(node.label, 'diagram-node-label'))
      if (node.cite) box.append(button('diagram-node-source', `[^${node.cite}] →`, () => this.emit('space-cite', { key: node.cite }), 'open the passage'))
      step.append(box)
      if (next) {
        const arrow = el('div', 'diagram-arrow')
        arrow.append(el('span', 'diagram-arrow-line'))
        if (this.isEditable) {
          arrow.append(
            editable({
              value: edge?.label ?? '',
              placeholder: '↓',
              className: 'diagram-edge-label',
              markdown: false,
              onCommit: (label) => {
                const edges = this.data.edges.filter((e) => !(e.from === index && e.to === index + 1))
                edges.push({ from: index, to: index + 1, ...(label ? { label } : {}) })
                this.change({ ...this.data, edges })
              },
            }),
          )
        } else if (edge?.label) arrow.append(inline(edge.label, 'diagram-edge-label'))
        step.append(arrow)
      }
      flow.append(step)
    })
    root.append(flow)
  }
}
