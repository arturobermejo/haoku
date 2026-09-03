import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import { CALLOUT_META, citationsOf, type Block, type Citation } from '../workspace/types'
import './PrintView.css'

/**
 * A static, print-only rendering of the document. Mounted on "export → PDF": once its images have
 * loaded it calls window.print(), where the browser offers "Save as PDF", and unmounts afterwards.
 */
export function PrintView({ onDone }: { onDone: () => void }) {
  const ws = useWorkspace()
  const { byId, imageUrl } = useSources()

  useEffect(() => {
    const previousTitle = document.title
    document.title = ws.title || 'saoku space'
    const finish = () => {
      document.title = previousTitle
      onDone()
    }
    window.addEventListener('afterprint', finish, { once: true })
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.print-doc img'))
    const ready = Promise.all(images.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => (img.onload = img.onerror = () => r())))))
    const timer = window.setTimeout(() => void ready.then(() => window.print()), 80)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', finish)
      document.title = previousTitle
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceName = (c: Citation) => {
    const s = byId(c.sourceId)
    return `${(s?.title ?? s?.name ?? 'removed source').replace(/\.[a-z0-9]+$/i, '')}${c.page && s?.kind === 'pdf' ? `, p. ${c.page}` : ''}`
  }

  const passages = (block: Block) => {
    const cites = citationsOf(block)
    if (cites.length === 0) return null
    return (
      <ol className="print-passages">
        {cites.map((c, i) => (
          <li key={i}>
            <span className="print-passage-source">{sourceName(c)}</span>
            {c.quote && <span className="print-passage-quote"> — “{c.quote}”</span>}
          </li>
        ))}
      </ol>
    )
  }

  return createPortal(
    <div className="print-doc">
      <header className="print-head">
        <h1 className="print-title">{ws.title}</h1>
        <div className="print-meta">
          saoku · {ws.blocks.length} {ws.blocks.length === 1 ? 'block' : 'blocks'} · exported {new Date().toLocaleDateString()}
        </div>
      </header>
      {ws.blocks.map((block) => (
        <section key={block.id} className={`print-block print-block--${block.content.type}`}>
          <PrintBody block={block} imageUrl={imageUrl} sourceName={sourceName} />
          {passages(block)}
        </section>
      ))}
      {ws.blocks.length === 0 && <p className="print-empty">This space is empty.</p>}
    </div>,
    document.body,
  )
}

function marks(text: string) {
  const out: React.ReactNode[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <sup key={m.index} className="print-mark">
        {m[1]}
      </sup>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function PrintBody({ block, imageUrl, sourceName }: { block: Block; imageUrl: (id: string) => string | undefined; sourceName: (c: Citation) => string }) {
  const c = block.content
  switch (c.type) {
    case 'heading': {
      const Tag = c.level === 1 ? 'h2' : c.level === 2 ? 'h3' : 'h4'
      return <Tag className="print-heading">{c.text}</Tag>
    }
    case 'paragraph':
      return <p className="print-paragraph">{marks(c.text)}</p>
    case 'callout':
      return (
        <div className={`print-callout print-callout--${c.tone}`}>
          <div className="print-label">
            {CALLOUT_META[c.tone].glyph} {CALLOUT_META[c.tone].label}
          </div>
          {c.title && <div className="print-callout-title">{c.title}</div>}
          <div>{c.body}</div>
        </div>
      )
    case 'diagram':
      return (
        <div className="print-diagram">
          <div className="print-label">diagram</div>
          {c.title && <div className="print-block-title">{c.title}</div>}
          <ol className="print-nodes">
            {c.nodes.map((n, i) => {
              const next = c.nodes[i + 1]
              const edge = next ? c.edges.find((e) => e.from === n.id && e.to === next.id) : undefined
              return (
                <li key={n.id}>
                  <span className="print-node">{n.label}</span>
                  {n.citation && <span className="print-node-source"> ({sourceName(n.citation)})</span>}
                  {next && <div className="print-edge">↓{edge?.label ? ` ${edge.label}` : ''}</div>}
                </li>
              )
            })}
          </ol>
        </div>
      )
    case 'comparison':
      return (
        <div>
          <div className="print-label">comparison</div>
          {c.title && <div className="print-block-title">{c.title}</div>}
          <table className="print-table">
            <thead>
              <tr>
                <th />
                {c.columns.map((col, i) => (
                  <th key={i}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={i}>
                  <th>{r.label}</th>
                  {c.columns.map((_, j) => (
                    <td key={j}>{r.cells[j] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'flashcards':
      return (
        <div>
          <div className="print-label">flashcards · {c.cards.length}</div>
          <ol className="print-cards">
            {c.cards.map((k) => (
              <li key={k.id}>
                <div className="print-card-q">{k.question}</div>
                <div className="print-card-a">{k.answer}</div>
              </li>
            ))}
          </ol>
        </div>
      )
    case 'quiz':
      return (
        <div>
          <div className="print-label">test yourself · {c.questions.length}</div>
          <ol className="print-questions">
            {c.questions.map((q) => (
              <li key={q.id}>
                <div className="print-question">{q.prompt}</div>
                <ul className="print-options">
                  {q.options.map((o, i) => (
                    <li key={i} className={i === q.answer ? 'is-answer' : ''}>
                      {i === q.answer ? '✓' : '○'} {o}
                    </li>
                  ))}
                </ul>
                {q.explanation && <div className="print-explanation">{q.explanation}</div>}
              </li>
            ))}
          </ol>
        </div>
      )
    case 'image': {
      const url = imageUrl(c.sourceId)
      return (
        <figure className="print-figure">
          {url ? <img src={url} alt={c.caption} /> : <div className="print-empty">image source missing</div>}
          {c.caption && <figcaption>{c.caption}</figcaption>}
        </figure>
      )
    }
  }
}
