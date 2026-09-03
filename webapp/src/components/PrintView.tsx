import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { blockLabel } from '../workspace/markdown/excerpt'
import type { ParsedBlock } from '../workspace/markdown/types'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import type { Citation } from '../workspace/types'
import { ElementBlock } from './blocks/ElementBlock'
import { renderBlockHtml } from './blocks/render'
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
    document.title = ws.title || 'haoku space'
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

  const passages = (block: ParsedBlock) => {
    const cites = ws.citationsOf(block)
    if (cites.length === 0) return null
    return (
      <ul className="print-passages">
        {cites.map((c, i) => (
          <li key={i}>
            <span className="print-passage-key">[^{block.citationKeys[i]}]</span> <span className="print-passage-source">{sourceName(c)}</span>
            {c.quote && <span className="print-passage-quote"> — “{c.quote}”</span>}
          </li>
        ))}
      </ul>
    )
  }

  return createPortal(
    <div className="print-doc">
      <header className="print-head">
        <h1 className="print-title">{ws.title}</h1>
        <div className="print-meta">
          haoku · {ws.blocks.length} {ws.blocks.length === 1 ? 'block' : 'blocks'} · exported {new Date().toLocaleDateString()}
        </div>
      </header>
      {ws.blocks.map((block) => {
        const label = blockLabel(block)
        return (
          <section key={block.id} data-block-id={block.id} className={`print-block print-block--${block.kind}`}>
            {label && <div className="print-label">{label}</div>}
            <PrintBody block={block} imageUrl={imageUrl} />
            {passages(block)}
          </section>
        )
      })}
      {ws.blocks.length === 0 && <p className="print-empty">This space is empty.</p>}
    </div>,
    document.body,
  )
}

function PrintBody({ block, imageUrl }: { block: ParsedBlock; imageUrl: (id: string) => string | undefined }) {
  const d = block.data
  switch (d.kind) {
    case 'image': {
      const url = imageUrl(d.sourceId)
      return (
        <figure className="print-figure">
          {url ? <img src={url} alt={d.caption} /> : <div className="print-empty">image source missing</div>}
          {d.caption && <figcaption dangerouslySetInnerHTML={{ __html: d.caption.replace(/\[\^(\w+)\]/g, '<sup class="print-mark">$1</sup>') }} />}
        </figure>
      )
    }
    case 'callout':
    case 'diagram':
    case 'flashcards':
    case 'quiz':
      return <ElementBlock block={block} data={d} print />
    default:
      return <div className={`print-md print-md--${d.kind}${d.kind === 'heading' ? ` print-heading-${d.level}` : ''}`} dangerouslySetInnerHTML={{ __html: renderBlockHtml(block) }} />
  }
}
