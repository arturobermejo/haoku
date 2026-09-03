import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'

/** The `[n]` mark in a paragraph: click opens the source at the cited passage. */
export function CitationMark({ n, citation }: { n: number; citation: Citation | undefined }) {
  const ws = useWorkspace()
  const { byId } = useSources()
  if (!citation) return <span className="cite cite--dangling">[{n}]</span>
  const source = byId(citation.sourceId)
  const title = `${source?.title ?? source?.name ?? 'removed source'}${citation.page ? ` · p.${citation.page}` : ''}`
  return (
    <button
      type="button"
      className="cite"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        ws.openViewer({ sourceId: citation.sourceId, page: citation.page, citation })
      }}
    >
      [{n}]
    </button>
  )
}
