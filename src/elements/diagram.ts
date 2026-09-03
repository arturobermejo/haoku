import { arr, button, el, num, SpaceElement, str } from './base'
import { editable, inline } from './editable'

export interface DiagramData {
  title: string
  nodes: { label: string; cite?: string }[]
  /** 0-based node indexes; any graph, cycles included. */
  edges: { from: number; to: number; label?: string }[]
}

const SVG = 'http://www.w3.org/2000/svg'
const GAP_X = 28
const GAP_Y = 52

/**
 * <space-diagram title="…">{"nodes":[…],"edges":[…]}</space-diagram> — a general graph.
 * Nodes are laid out in layers (longest path from the sources), edges are drawn as curves with
 * arrowheads. Editable: labels, `+ node`, connect (⇢ on two nodes), delete node or edge.
 */
export class SpaceDiagram extends SpaceElement<DiagramData> {
  #connectFrom: number | null = null
  #parts: { canvas: HTMLElement; stage: HTMLElement; svg: SVGSVGElement; nodeEls: HTMLElement[] } | null = null
  #observer: ResizeObserver | null = null
  #lastWidth = 0

  /** Positions need real sizes, so the layout runs right after the nodes are in the document, and again on resize. */
  render() {
    super.render()
    this.#layout()
    if (!this.#observer && typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(() => {
        if (this.clientWidth !== this.#lastWidth) this.#layout()
      })
      this.#observer.observe(this)
    }
  }

  #layout() {
    if (!this.#parts || !this.isConnected) return
    this.#lastWidth = this.clientWidth
    this.#place(this.#parts.canvas, this.#parts.stage, this.#parts.svg, this.#parts.nodeEls)
  }

  protected parseSource(): DiagramData {
    const json = this.jsonSource() ?? {}
    const nodes = arr(json.nodes).map((n) => ({ label: str(n.label), ...(str(n.cite) ? { cite: str(n.cite) } : {}) }))
    const edges = arr(json.edges)
      .map((e) => ({ from: num(e.from, -1), to: num(e.to, -1), ...(str(e.label) ? { label: str(e.label) } : {}) }))
      .filter((e) => e.from >= 0 && e.to >= 0 && e.from < nodes.length && e.to < nodes.length)
    return { title: this.getAttribute('title') ?? '', nodes, edges }
  }

  #setNodes(nodes: DiagramData['nodes']) {
    this.change({ ...this.data, nodes })
  }
  #setEdges(edges: DiagramData['edges']) {
    this.change({ ...this.data, edges })
  }
  #removeNode(index: number) {
    const nodes = this.data.nodes.filter((_, i) => i !== index)
    const edges = this.data.edges.filter((e) => e.from !== index && e.to !== index).map((e) => ({ ...e, from: e.from > index ? e.from - 1 : e.from, to: e.to > index ? e.to - 1 : e.to }))
    this.#connectFrom = null
    this.change({ ...this.data, nodes, edges })
  }
  #connect(index: number) {
    if (this.#connectFrom === null || this.#connectFrom === index) {
      this.#connectFrom = this.#connectFrom === index ? null : index
      this.render()
      return
    }
    const from = this.#connectFrom
    this.#connectFrom = null
    if (this.data.edges.some((e) => e.from === from && e.to === index)) {
      this.render()
      return
    }
    this.#setEdges([...this.data.edges, { from, to: index }])
  }

  protected renderInto(root: HTMLElement) {
    const d = this.data
    const editing = this.isEditable
    root.className = 'space-root diagram-block'
    if (editing) root.append(editable({ value: d.title, placeholder: 'diagram title', className: 'block-title', onCommit: (t) => this.change({ ...this.data, title: t }) }))
    else if (d.title) root.append(inline(d.title, 'block-title'))

    const canvas = el('div', 'diagram-canvas')
    const stage = el('div', 'diagram-stage')
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('class', 'diagram-edges')
    stage.append(svg)
    const nodeEls = d.nodes.map((node, index) => {
      const box = el('div', `diagram-node${this.#connectFrom === index ? ' is-connecting' : ''}`)
      box.dataset.index = String(index)
      if (editing) box.append(editable({ value: node.label, placeholder: 'node', className: 'diagram-node-label', onCommit: (label) => this.#setNodes(this.data.nodes.map((n, i) => (i === index ? { ...n, label } : n))) }))
      else box.append(inline(node.label, 'diagram-node-label'))
      const tools = el('span', 'diagram-node-tools')
      if (node.cite) tools.append(button('diagram-node-source', `[^${node.cite}] →`, () => this.emit('space-cite', { key: node.cite }), 'open the passage'))
      if (editing) {
        tools.append(button('diagram-node-tool', '⇢', () => this.#connect(index), this.#connectFrom === null ? 'connect: pick this node, then the target' : this.#connectFrom === index ? 'cancel connecting' : 'connect to this node'))
        tools.append(button('diagram-node-tool', '×', () => this.#removeNode(index), 'remove this node'))
      }
      box.append(tools)
      stage.append(box)
      return box
    })
    canvas.append(stage)
    root.append(canvas)
    if (editing) {
      const bar = el('div', 'diagram-bar')
      bar.append(button('diagram-add-node', '+ node', () => this.#setNodes([...this.data.nodes, { label: '' }])))
      if (this.#connectFrom !== null) bar.append(el('span', 'diagram-hint', 'now pick the node it points to'))
      root.append(bar)
    }
    if (d.nodes.length === 0) stage.append(el('div', 'diagram-empty', editing ? 'no nodes yet' : 'empty diagram'))
    this.#parts = { canvas, stage, svg, nodeEls }
  }

  #place(canvas: HTMLElement, stage: HTMLElement, svg: SVGSVGElement, nodeEls: HTMLElement[]) {
    const d = this.data
    if (!stage.isConnected || d.nodes.length === 0) return
    const { layers } = layout(d.nodes.length, d.edges)
    const sizes = nodeEls.map((n) => ({ w: Math.max(n.offsetWidth, 60), h: Math.max(n.offsetHeight, 32) }))
    const rows = layers.map((row) => ({ nodes: row, width: row.reduce((sum, i) => sum + sizes[i].w, 0) + GAP_X * Math.max(0, row.length - 1), height: Math.max(...row.map((i) => sizes[i].h)) }))
    const width = Math.max(canvas.clientWidth || canvas.getBoundingClientRect().width, ...rows.map((r) => r.width))
    const pos: { x: number; y: number; w: number; h: number }[] = []
    let y = 0
    for (const row of rows) {
      let x = (width - row.width) / 2
      for (const i of row.nodes) {
        pos[i] = { x, y: y + (row.height - sizes[i].h) / 2, w: sizes[i].w, h: sizes[i].h }
        x += sizes[i].w + GAP_X
      }
      y += row.height + GAP_Y
    }
    const height = Math.max(0, y - GAP_Y)
    stage.style.width = `${width}px`
    stage.style.height = `${height}px`
    nodeEls.forEach((n, i) => {
      n.style.left = `${pos[i].x}px`
      n.style.top = `${pos[i].y}px`
    })
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.replaceChildren()
    const defs = document.createElementNS(SVG, 'defs')
    defs.innerHTML = '<marker id="space-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker>'
    svg.append(defs)
    stage.querySelectorAll('.diagram-edge-label, .diagram-edge-tool').forEach((e) => e.remove())
    d.edges.forEach((edge, ei) => {
      const a = pos[edge.from]
      const b = pos[edge.to]
      if (!a || !b) return
      let path: string
      let mid: { x: number; y: number }
      if (edge.from === edge.to) {
        const x = a.x + a.w
        const cy = a.y + a.h / 2
        path = `M ${x} ${cy - 8} C ${x + 36} ${cy - 30}, ${x + 36} ${cy + 30}, ${x} ${cy + 8}`
        mid = { x: x + 30, y: cy }
      } else if (b.y > a.y + a.h - 1) {
        const x1 = a.x + a.w / 2
        const y1 = a.y + a.h
        const x2 = b.x + b.w / 2
        const y2 = b.y
        const c = (y2 - y1) / 2
        path = `M ${x1} ${y1} C ${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`
        mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
      } else if (a.y > b.y + b.h - 1) {
        // Upward edge: leave from the side and come back in from the side.
        const x1 = a.x + a.w
        const y1 = a.y + a.h / 2
        const x2 = b.x + b.w
        const y2 = b.y + b.h / 2
        const bulge = 40 + Math.abs(x1 - x2) / 4
        path = `M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x2 + bulge} ${y2}, ${x2 + 2} ${y2}`
        mid = { x: Math.max(x1, x2) + bulge * 0.75, y: (y1 + y2) / 2 }
      } else {
        // Same row: side to side.
        const leftToRight = a.x < b.x
        const x1 = leftToRight ? a.x + a.w : a.x
        const x2 = leftToRight ? b.x : b.x + b.w
        const y1 = a.y + a.h / 2
        const y2 = b.y + b.h / 2
        path = `M ${x1} ${y1} L ${x2} ${y2}`
        mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
      }
      const p = document.createElementNS(SVG, 'path')
      p.setAttribute('d', path)
      p.setAttribute('class', 'diagram-edge')
      p.setAttribute('marker-end', 'url(#space-arrow)')
      svg.append(p)
      if (this.isEditable || edge.label) {
        const label = this.isEditable
          ? editable({ value: edge.label ?? '', placeholder: '·', className: 'diagram-edge-label', markdown: false, onCommit: (text) => this.#setEdges(this.data.edges.map((e, i) => (i === ei ? { from: e.from, to: e.to, ...(text ? { label: text } : {}) } : e))) })
          : inline(edge.label ?? '', 'diagram-edge-label')
        label.style.left = `${mid.x}px`
        label.style.top = `${mid.y}px`
        stage.append(label)
        if (this.isEditable) {
          const remove = button('diagram-edge-tool', '×', () => this.#setEdges(this.data.edges.filter((_, i) => i !== ei)), 'remove this edge')
          remove.style.left = `${mid.x + label.offsetWidth / 2 + 9}px`
          remove.style.top = `${mid.y}px`
          stage.append(remove)
        }
      }
    })
  }
}

/** Layers by longest path from the sources (cycles broken along a DFS), nodes ordered by their predecessors' positions. */
export function layout(count: number, edges: { from: number; to: number }[]): { layers: number[][]; layerOf: number[] } {
  const out: number[][] = Array.from({ length: count }, () => [])
  const forward: { from: number; to: number }[] = []
  for (const e of edges) if (e.from !== e.to) out[e.from].push(e.to)
  // Break cycles: edges closing a DFS loop are dropped for layering only.
  const state = new Array<number>(count).fill(0)
  const visit = (v: number) => {
    state[v] = 1
    for (const w of out[v]) {
      if (state[w] === 0) visit(w)
      if (state[w] !== 1) forward.push({ from: v, to: w })
    }
    state[v] = 2
  }
  for (let v = 0; v < count; v++) if (state[v] === 0) visit(v)
  const preds: number[][] = Array.from({ length: count }, () => [])
  const succs: number[][] = Array.from({ length: count }, () => [])
  for (const e of forward) {
    preds[e.to].push(e.from)
    succs[e.from].push(e.to)
  }
  const layerOf = new Array<number>(count).fill(-1)
  const depth = (v: number): number => {
    if (layerOf[v] >= 0) return layerOf[v]
    layerOf[v] = 0
    layerOf[v] = preds[v].length ? Math.max(...preds[v].map(depth)) + 1 : 0
    return layerOf[v]
  }
  for (let v = 0; v < count; v++) depth(v)
  const layers: number[][] = []
  for (let v = 0; v < count; v++) (layers[layerOf[v]] ??= []).push(v)
  const position = new Array<number>(count).fill(0)
  layers.forEach((row, li) => {
    if (li > 0) {
      const key = (v: number) => (preds[v].length ? preds[v].reduce((s, p) => s + position[p], 0) / preds[v].length : position[v])
      row.sort((a, b) => key(a) - key(b) || a - b)
    }
    row.forEach((v, i) => (position[v] = i))
  })
  return { layers: layers.filter((r) => r && r.length), layerOf }
}
