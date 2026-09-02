import { useState, type CSSProperties, type PointerEvent } from 'react'
import { useAugmentations } from '../augment/store'
import { anchorsOf, KIND_META, kindOf, type Augmentation } from '../augment/types'
import { DiagramBody } from './DiagramBody'
import { EditableText } from './EditableText'
import { useWorkspace } from './workspaceContext'
import './Card.css'

interface CardProps {
  item: Augmentation
  left: number
  top: number
  zIndex: number
  dragging: boolean
  onDragStart: (event: PointerEvent<HTMLDivElement>) => void
}

function sourceLabel(item: Augmentation): string {
  const anchors = anchorsOf(item)
  if (anchors.length === 1) return `p.${anchors[0].page}`
  return `${anchors.length} regions`
}

export function Card({ item, left, top, zIndex, dragging, onDragStart }: CardProps) {
  const aug = useAugmentations()
  const { jumpTo } = useWorkspace()
  const [answerShown, setAnswerShown] = useState(false)
  const [jumpIndex, setJumpIndex] = useState(0)

  const kind = kindOf(item)
  const meta = KIND_META[kind]
  const selected = aug.selectedId === item.id
  const isDraft = aug.draftId === item.id
  const anchors = anchorsOf(item)
  const multiSource = anchors.length > 2

  const jump = () => {
    if (anchors.length === 0) return
    const i = jumpIndex % anchors.length
    jumpTo(anchors[i])
    setJumpIndex(i + 1)
  }

  const style = { left, top, zIndex, '--accent': meta.accent } as CSSProperties
  const className = ['card', selected ? 'is-selected' : '', dragging ? 'is-dragging' : '', isDraft ? 'is-draft' : ''].filter(Boolean).join(' ')

  return (
    <div className={className} style={style} onPointerDown={onDragStart} onClick={(e) => e.stopPropagation()}>
      <div className="card-head">
        <span className="card-glyph">{meta.glyph}</span>
        <span className="card-kind">{meta.label}</span>
        <span className="card-source">{sourceLabel(item)}</span>
        <button type="button" className="card-remove" onClick={() => aug.remove(item.id)} title="remove">
          ×
        </button>
      </div>

      <div className="card-body">
        {item.type === 'highlight' && (
          <>
            <div className="card-quote">“{item.anchor.text.length > 140 ? `${item.anchor.text.slice(0, 140)}…` : item.anchor.text}”</div>
            <EditableText
              value={item.note ?? ''}
              placeholder="add a note…"
              multiline
              autoEdit={item.note === ''}
              className="card-text"
              onChange={(note) => aug.update(item.id, (i) => (i.type === 'highlight' ? { ...i, note } : i))}
            />
          </>
        )}

        {item.type === 'note' && (
          <>
            <EditableText value={item.title} placeholder="title" className="card-title" onChange={(title) => aug.update(item.id, (i) => (i.type === 'note' ? { ...i, title } : i))} />
            <EditableText value={item.body} placeholder="write the note…" multiline className="card-text" onChange={(body) => aug.update(item.id, (i) => (i.type === 'note' ? { ...i, body } : i))} />
            {multiSource && <div className="card-hint">no threads · tap a source to go there</div>}
            <div className="card-sources">
              {item.anchors.map((anchor, n) => (
                <button key={n} type="button" className="card-source-row" onClick={() => jumpTo(anchor)}>
                  <span className="card-source-text">“{anchor.text.length > 70 ? `${anchor.text.slice(0, 70)}…` : anchor.text}”</span>
                  <span className="card-source-page">p.{anchor.page} →</span>
                </button>
              ))}
            </div>
          </>
        )}

        {item.type === 'flashcard' && (
          <>
            <EditableText
              value={item.question}
              placeholder="write the question…"
              multiline
              autoEdit={item.question === ''}
              className="card-title"
              onChange={(question) => aug.update(item.id, (i) => (i.type === 'flashcard' ? { ...i, question } : i))}
            />
            <div className="card-answer">
              {answerShown ? (
                <EditableText value={item.answer} placeholder="answer" multiline className="card-text card-text--answer" onChange={(answer) => aug.update(item.id, (i) => (i.type === 'flashcard' ? { ...i, answer } : i))} />
              ) : (
                <button type="button" className="control card-reveal" onClick={() => setAnswerShown(true)}>
                  reveal answer
                </button>
              )}
            </div>
          </>
        )}

        {item.type === 'diagram' && (
          <>
            <EditableText value={item.title} placeholder="diagram title" className="card-title" onChange={(title) => aug.update(item.id, (i) => (i.type === 'diagram' ? { ...i, title } : i))} />
            <DiagramBody item={item} />
          </>
        )}

        {isDraft && (
          <div className="card-draft">
            <span>collecting · select text and press cite</span>
            <button type="button" className="control control--primary" onClick={() => aug.setDraft(null)}>
              done
            </button>
          </div>
        )}
      </div>

      <div className="card-foot">
        <button type="button" className="card-jump" onClick={jump}>
          {anchors.length > 1 ? `jump to source ${(jumpIndex % anchors.length) + 1}/${anchors.length} →` : 'jump to source →'}
        </button>
        <button type="button" className="card-dismiss" onClick={() => aug.toggleFold(item.id)}>
          dismiss
        </button>
      </div>
    </div>
  )
}
