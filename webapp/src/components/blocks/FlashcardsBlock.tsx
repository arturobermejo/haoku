import { useSources } from '../../workspace/sources'
import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'flashcards' }>

export function FlashcardsBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  const { byId } = useSources()
  const setCard = (id: string, patch: { question?: string; answer?: string }) =>
    ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, cards: content.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) } }))

  return (
    <div className="flashcards">
      {content.cards.map((card) => {
        const shown = ws.revealed[card.id] === true
        const source = card.citation ? byId(card.citation.sourceId) : undefined
        return (
          <div key={card.id} className={`flashcard${shown ? ' is-revealed' : ''}`}>
            <EditableText value={card.question} placeholder="question" multiline className="flashcard-question" onChange={(question) => setCard(card.id, { question })} />
            {shown ? (
              <div className="flashcard-answer">
                <EditableText value={card.answer} placeholder="answer" multiline className="flashcard-answer-text" onChange={(answer) => setCard(card.id, { answer })} />
                <div className="flashcard-foot">
                  {card.citation ? (
                    <button type="button" className="flashcard-source" onClick={() => ws.openViewer({ sourceId: card.citation!.sourceId, page: card.citation!.page, citation: card.citation })}>
                      source → {(source?.title ?? source?.name ?? 'source').replace(/\.[a-z0-9]+$/i, '')}
                      {card.citation.page ? ` · p.${card.citation.page}` : ''}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button type="button" className="flashcard-hide" onClick={() => ws.reveal(card.id, false)}>
                    hide
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="control flashcard-reveal" onClick={() => ws.reveal(card.id, true)}>
                reveal answer
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
