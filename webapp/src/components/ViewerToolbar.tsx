import { useEffect, useState, type CSSProperties } from 'react'
import type { Anchor } from '../tools/textIndex'
import { HIGHLIGHT_KINDS, HIGHLIGHT_META, type HighlightKind } from '../workspace/types'
import './ViewerToolbar.css'

export interface ViewerSelection {
  text: string
  page: number
  anchor?: Anchor
  rect: DOMRect
}

interface ViewerToolbarProps {
  getSelection: () => ViewerSelection | null
  onCite: (selection: ViewerSelection) => void
  /** What pressing cite does right now, e.g. "add to summary". */
  citeLabel?: string
  /** PDF only; text sources cannot carry washes. */
  onHighlight?: (selection: ViewerSelection, kind: HighlightKind) => void
}

/** Floats above the selection in the source viewer: highlight it, or cite it in the document. */
export function ViewerToolbar({ getSelection, onCite, onHighlight, citeLabel = 'cite' }: ViewerToolbarProps) {
  const [shown, setShown] = useState<ViewerSelection | null>(null)
  const [kind, setKind] = useState<HighlightKind>('claim')

  useEffect(() => {
    let timer = 0
    let pointerDown = false
    const update = () => {
      timer = 0
      if (pointerDown) return
      setShown(getSelection())
    }
    const schedule = () => {
      if (!timer) timer = window.setTimeout(update, 0)
    }
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element).closest('.viewer-toolbar')) return
      pointerDown = true
      setShown(null)
    }
    const onPointerUp = () => {
      pointerDown = false
      schedule()
    }
    document.addEventListener('selectionchange', schedule)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('scroll', schedule, true)
    return () => {
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('selectionchange', schedule)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [getSelection])

  if (!shown) return null
  const width = (onHighlight ? 220 : 0) + citeLabel.length * 8 + 40
  const left = Math.max(8, Math.min(shown.rect.left, window.innerWidth - width - 8))
  const top = shown.rect.top - 44
  const style: CSSProperties = { left, top: top < 62 ? shown.rect.bottom + 8 : top }
  const done = () => {
    window.getSelection()?.removeAllRanges()
    setShown(null)
  }

  return (
    <div className="viewer-toolbar" style={style} onPointerDown={(e) => e.preventDefault()}>
      {onHighlight && (
        <>
          <div className="viewer-kinds" role="radiogroup" aria-label="highlight kind">
            {HIGHLIGHT_KINDS.map((k) => (
              <button key={k} type="button" className={`viewer-kind${kind === k ? ' is-active' : ''}`} style={{ '--accent': HIGHLIGHT_META[k].accent } as CSSProperties} onClick={() => setKind(k)} title={k} aria-pressed={kind === k}>
                {HIGHLIGHT_META[k].glyph}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="viewer-action"
            onClick={() => {
              onHighlight(shown, kind)
              done()
            }}
          >
            highlight
          </button>
          <span className="viewer-divider" />
        </>
      )}
      <button
        type="button"
        className="viewer-action"
        onClick={() => {
          onCite(shown)
          done()
        }}
        title="link this passage to the document"
      >
        {citeLabel}
      </button>
    </div>
  )
}
