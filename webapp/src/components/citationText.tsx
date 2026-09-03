import type { Citation } from '../workspace/types'
import { CitationMark } from './CitationMark'

/** Splits paragraph text on `[n]` marks. */
export function renderWithCitations(text: string, citations: Citation[]): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const n = Number(m[1])
    out.push(<CitationMark key={`${m.index}`} n={n} citation={citations[n - 1]} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
