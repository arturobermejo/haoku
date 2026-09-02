import { useEffect, useState, type CSSProperties } from 'react'
import { newId } from '../augment/ids'
import { unionRect } from '../augment/geometry'
import { anchorFromSelection, type SelectionResult } from '../augment/selection'
import { useAugmentations } from '../augment/store'
import { HIGHLIGHT_KINDS, KIND_META, type Anchor, type Kind } from '../augment/types'
import { useWorkspace } from './workspaceContext'
import './SelectionToolbar.css'

interface Shown {
  result: SelectionResult
  rect: DOMRect
}

const TOOLBAR_WIDTH = 560
const TOOLBAR_HEIGHT = 40

/** Floats above the current text selection; every button turns the selection into an anchored augmentation. */
export function SelectionToolbar() {
  const { scale } = useWorkspace()
  const aug = useAugmentations()
  const [shown, setShown] = useState<Shown | null>(null)
  const [kind, setKind] = useState<Kind>('claim')

  useEffect(() => {
    let frame = 0
    let pointerDown = false

    const update = () => {
      frame = 0
      if (pointerDown) return
      const selection = window.getSelection()
      const result = anchorFromSelection(selection, scale)
      if (result.ok) setShown({ result, rect: result.clientRect })
      else if (result.reason === 'multi-page' && selection) setShown({ result, rect: selection.getRangeAt(0).getBoundingClientRect() })
      else setShown(null)
    }
    // setTimeout rather than rAF: background tabs still need the toolbar to settle.
    const schedule = () => {
      if (!frame) frame = window.setTimeout(update, 0)
    }
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element).closest('.selection-toolbar')) return
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
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.clearTimeout(frame)
      document.removeEventListener('selectionchange', schedule)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [scale])

  if (!shown) return null

  const left = Math.max(8, Math.min(shown.rect.left, window.innerWidth - TOOLBAR_WIDTH - 8))
  const top = shown.rect.top - TOOLBAR_HEIGHT - 8
  const style: CSSProperties = { left, top: top < 62 ? shown.rect.bottom + 8 : top }

  if (!shown.result.ok) {
    return (
      <div className="selection-toolbar selection-toolbar--message" style={style} onPointerDown={(e) => e.preventDefault()}>
        select within one page
      </div>
    )
  }

  const anchor = shown.result.anchor
  const done = () => {
    window.getSelection()?.removeAllRanges()
    setShown(null)
  }
  const withAnchor = (fn: (anchor: Anchor) => void) => () => {
    fn(anchor)
    done()
  }

  const draft = aug.draftId ? aug.byId(aug.draftId) : undefined

  const highlight = withAnchor((a) => aug.add({ type: 'highlight', kind, anchor: a }))
  const note = withAnchor((a) => aug.add({ type: 'highlight', kind, anchor: a, note: '' }))
  const cite = withAnchor((a) => {
    if (aug.cite(a)) return
    const item = aug.add({ type: 'note', kind: 'synthesis', title: '', body: '', anchors: [a] })
    aug.setDraft(item.id)
  })
  const rewrite = withAnchor((a) => aug.add({ type: 'rewrite', anchor: a, text: '', showRewrite: true }))
  const fold = withAnchor((a) => {
    const union = unionRect(a.rects)
    aug.add({ type: 'fold', page: a.page, y0: union.y - 2, y1: union.y + union.h + 2, collapsed: true })
  })
  const flashcard = withAnchor((a) => aug.add({ type: 'flashcard', question: '', answer: a.text, anchor: a }))
  const diagram = withAnchor((a) => {
    if (draft?.type === 'diagram' && aug.cite(a)) return
    const node = { id: newId('node'), label: a.text.slice(0, 60), anchor: a }
    const item = aug.add({ type: 'diagram', title: '', nodes: [node], edges: [] })
    aug.setDraft(item.id)
  })

  return (
    <div className="selection-toolbar" style={style} onPointerDown={(e) => e.preventDefault()}>
      <div className="selection-kinds" role="radiogroup" aria-label="Highlight kind">
        {HIGHLIGHT_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`selection-kind${kind === k ? ' is-active' : ''}`}
            style={{ '--accent': KIND_META[k].accent } as CSSProperties}
            onClick={() => setKind(k)}
            title={KIND_META[k].label}
            aria-pressed={kind === k}
          >
            {KIND_META[k].glyph}
          </button>
        ))}
      </div>
      <span className="selection-divider" />
      <button type="button" className="selection-action" onClick={highlight}>
        highlight
      </button>
      <button type="button" className="selection-action" onClick={note}>
        note
      </button>
      <button type="button" className={`selection-action${draft ? ' is-hot' : ''}`} onClick={cite} title={draft ? `add to the open ${draft.type}` : 'start a note that cites several passages'}>
        cite{draft ? ` +${draft.type === 'note' ? draft.anchors.length : draft.type === 'diagram' ? draft.nodes.length : ''}` : ''}
      </button>
      <button type="button" className="selection-action" onClick={rewrite}>
        rewrite
      </button>
      <button type="button" className="selection-action" onClick={fold}>
        fold
      </button>
      <button type="button" className="selection-action" onClick={flashcard}>
        flashcard
      </button>
      <button type="button" className={`selection-action${draft?.type === 'diagram' ? ' is-hot' : ''}`} onClick={diagram}>
        diagram
      </button>
    </div>
  )
}
