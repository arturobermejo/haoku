import { useWorkspace } from '../../workspace/store'
import type { Block, BlockContent } from '../../workspace/types'
import { EditableText } from '../EditableText'

type Content = Extract<BlockContent, { type: 'quiz' }>

export function QuizBlock({ block, content }: { block: Block; content: Content }) {
  const ws = useWorkspace()
  const patchQuestion = (id: string, patch: Partial<Content['questions'][number]>) =>
    ws.updateBlock(block.id, (b) => ({ ...b, content: { ...content, questions: content.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) } }))
  const setPrompt = (id: string, prompt: string) => patchQuestion(id, { prompt })

  return (
    <div className="quiz">
      {content.questions.map((q, n) => {
        const picked = ws.quizAnswers[q.id]
        const answered = picked !== undefined
        const correct = answered && picked === q.answer
        return (
          <div key={q.id} className={`quiz-question${answered ? (correct ? ' is-correct' : ' is-wrong') : ''}`}>
            <div className="quiz-prompt">
              <span className="quiz-number">{n + 1}</span>
              <EditableText value={q.prompt} placeholder="question" multiline className="quiz-prompt-text" onChange={(prompt) => setPrompt(q.id, prompt)} />
            </div>
            <div className="quiz-options" role="radiogroup">
              {q.options.map((option, i) => {
                const state = !answered ? '' : i === q.answer ? ' is-answer' : i === picked ? ' is-picked' : ''
                return (
                  <div key={i} className={`quiz-option${state}`}>
                    <button type="button" role="radio" aria-checked={picked === i} className="quiz-pick" onClick={() => ws.answerQuiz(q.id, i)} title="choose this answer">
                      <span className="quiz-radio">{picked === i ? '●' : '○'}</span>
                    </button>
                    <EditableText value={option} placeholder={`option ${i + 1}`} className="quiz-option-text" onChange={(v) => patchQuestion(q.id, { options: q.options.map((o, k) => (k === i ? v : o)) })} />
                    {!answered && (
                      <button type="button" className={`quiz-mark${q.answer === i ? ' is-on' : ''}`} onClick={() => patchQuestion(q.id, { answer: i })} title={q.answer === i ? 'this is the right answer' : 'mark as the right answer'}>
                        ✓
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {!answered && (
              <button type="button" className="quiz-add-option" onClick={() => patchQuestion(q.id, { options: [...q.options, ''] })}>
                + option
              </button>
            )}
            {answered && (
              <div className="quiz-feedback">
                <span className="quiz-verdict">{correct ? 'correct' : `not quite — the answer is “${q.options[q.answer]}”`}</span>
                {q.explanation && <span className="quiz-explanation">{q.explanation}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
