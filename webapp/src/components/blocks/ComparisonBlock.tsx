import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'comparison' }>

export function ComparisonBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  const set = (patch: Partial<Content>) => ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, ...patch } }))
  const setCell = (row: number, col: number, value: string) =>
    set({ rows: content.rows.map((r, i) => (i === row ? { ...r, cells: r.cells.map((c, j) => (j === col ? value : c)) } : r)) })

  return (
    <div className="comparison-block">
      {content.title && <EditableText value={content.title} placeholder="title" className="block-title" onChange={(title) => set({ title })} />}
      <div className="comparison-scroll">
        <table className="comparison">
          <thead>
            <tr>
              <th />
              {content.columns.map((col, j) => (
                <th key={j}>
                  <EditableText value={col} placeholder="column" onChange={(v) => set({ columns: content.columns.map((c, k) => (k === j ? v : c)) })} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((row, i) => (
              <tr key={i}>
                <th scope="row">
                  <EditableText value={row.label} placeholder="row" onChange={(label) => set({ rows: content.rows.map((r, k) => (k === i ? { ...r, label } : r)) })} />
                </th>
                {content.columns.map((_, j) => (
                  <td key={j}>
                    <EditableText value={row.cells[j] ?? ''} placeholder="—" multiline onChange={(v) => setCell(i, j, v)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
