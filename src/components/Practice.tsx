import { useMemo, useState } from 'react'
import { renderInline } from '../elements/inline'
import { buildDeck, orderForPractice, progressSummary, type DeckItem } from '../workspace/practice'
import { useSources } from '../workspace/sources'
import { useWorkspace } from '../workspace/store'
import './Practice.css'

/**
 * The practice view: one multiple-choice question at a time from the practice bank.
 * Wrong answers come back sooner; progress persists with the space.
 */
export function Practice() {
  const ws = useWorkspace()
  const { byId } = useSources()
  const [round, setRound] = useState(0)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [tally, setTally] = useState({ right: 0, wrong: 0 })
  const [dropping, setDropping] = useState<string | null>(null)

  const deck = useMemo(() => buildDeck(ws.practice), [ws.practice])
  // The order is fixed for a round: built when the round starts (the progress only matters then), and
  // a question that is removed drops out of it instead of reshuffling what is left.
  const [built, setBuilt] = useState<{ round: number; order: DeckItem[] }>({ round: -1, order: [] })
  if (built.round !== round || (built.order.length === 0 && deck.length > 0)) setBuilt({ round, order: orderForPractice(deck, ws.getState().practiceProgress) })
  const live = new Set(deck.map((d) => d.id))
  const order = built.order.filter((q) => live.has(q.id))
  const summary = progressSummary(deck, ws.practiceProgress)
  const current: DeckItem | undefined = order[index]
  const done = order.length > 0 && index >= order.length

  const restart = () => {
    setRound((r) => r + 1)
    setIndex(0)
    setPicked(null)
    setDropping(null)
    setTally({ right: 0, wrong: 0 })
  }
  const advance = () => {
    setIndex((i) => i + 1)
    setPicked(null)
    setDropping(null)
  }
  /** Removing is permanent, so the button asks once; the next question takes this place. */
  const remove = () => {
    if (!current) return
    if (dropping !== current.id) {
      setDropping(current.id)
      return
    }
    ws.removePractice([current.id])
    setDropping(null)
    setPicked(null)
  }
  const pick = (option: number) => {
    if (!current || picked !== null) return
    setPicked(option)
    const correct = option === current.answer
    ws.gradePractice(current.id, correct)
    setTally((t) => ({ right: t.right + (correct ? 1 : 0), wrong: t.wrong + (correct ? 0 : 1) }))
  }
  const openSource = (it: DeckItem) => {
    if (it.citation) ws.openViewer({ sourceId: it.citation.sourceId, page: it.citation.page, citation: it.citation })
  }
  const sourceLabel = (it: DeckItem) => {
    if (!it.citation) return null
    const s = byId(it.citation.sourceId)
    return `${(s?.title ?? s?.name ?? 'source').replace(/\.[a-z0-9]+$/i, '')}${it.citation.page && s?.kind === 'pdf' ? ` · p.${it.citation.page}` : ''}`
  }

  return (
    <main className="document scroll practice">
      <div className="document-page practice-page">
        <div className="practice-head">
          <div className="panel-label">
            practice · {deck.length} {deck.length === 1 ? 'question' : 'questions'}
          </div>
          <button type="button" className="control" onClick={restart} disabled={deck.length === 0}>
            new round
          </button>
        </div>

        <div className="practice-stats">
          <span>
            <b>{summary.mastered}</b> mastered
          </span>
          <span>
            <b>{summary.struggling}</b> to review
          </span>
          <span>
            <b>{summary.unseen}</b> unseen
          </span>
          {Object.keys(ws.practiceProgress).length > 0 && (
            <button type="button" className="practice-reset" onClick={() => ws.resetPractice()}>
              reset progress
            </button>
          )}
        </div>

        {deck.length === 0 ? (
          <div className="practice-empty">
            <div className="document-empty-title">Nothing to practise yet.</div>
            <div className="document-empty-body">Ask your agent for questions: it can add them with add_practice, each one tied to a passage of the sources.</div>
          </div>
        ) : done ? (
          <div className="practice-card practice-done">
            <div className="practice-done-title">Round over</div>
            <div className="practice-done-body">
              {tally.right} right · {tally.wrong} wrong of {order.length}
            </div>
            <div className="practice-actions">
              <button type="button" className="control control--primary" onClick={restart}>
                again
              </button>
            </div>
          </div>
        ) : current ? (
          <div className="practice-card">
            <div className="practice-progress">
              <span className="practice-progress-bar">
                <span style={{ width: `${(index / order.length) * 100}%` }} />
              </span>
              <span className="practice-progress-text">
                {index + 1} / {order.length}
                {current.topic ? ` · ${current.topic}` : ''}
              </span>
            </div>

            <div className="practice-prompt" dangerouslySetInnerHTML={{ __html: renderInline(current.prompt) }} />
            <div className="practice-options">
              {current.options.map((o, i) => {
                const state = picked === null ? '' : i === current.answer ? ' is-answer' : i === picked ? ' is-picked' : ''
                return (
                  <button key={i} type="button" className={`practice-option${state}`} disabled={picked !== null} onClick={() => pick(i)}>
                    <span className="practice-option-glyph">{picked === null ? '○' : i === current.answer ? '●' : i === picked ? '×' : '○'}</span>
                    <span dangerouslySetInnerHTML={{ __html: renderInline(o) }} />
                  </button>
                )
              })}
            </div>
            {picked !== null && (
              <div className={`practice-feedback${picked === current.answer ? ' is-right' : ' is-wrong'}`}>
                <div className="practice-verdict">{picked === current.answer ? 'correct' : `not quite — the answer is “${current.options[current.answer] ?? ''}”`}</div>
                {current.explanation && <div className="practice-explanation" dangerouslySetInnerHTML={{ __html: renderInline(current.explanation) }} />}
              </div>
            )}

            <div className="practice-actions">
              {current.citation && (
                <button type="button" className="practice-source" onClick={() => openSource(current)}>
                  {sourceLabel(current)} →
                </button>
              )}
              <button type="button" className={`practice-remove${dropping === current.id ? ' is-armed' : ''}`} onClick={remove} title="remove this question from the bank">
                {dropping === current.id ? 'remove it?' : 'remove'}
              </button>
              <span className="practice-actions-spacer" />
              {picked !== null ? (
                <button type="button" className="control control--primary" onClick={advance}>
                  next
                </button>
              ) : (
                <button type="button" className="practice-skip" onClick={advance}>
                  skip
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
