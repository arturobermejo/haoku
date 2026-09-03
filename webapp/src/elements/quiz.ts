import { arr, button, el, num, SpaceElement, str } from './base'
import { editable, inline } from './editable'
import { renderInline } from './inline'

export interface QuizData {
  questions: { prompt: string; options: string[]; answer: number; explanation?: string }[]
}

/**
 * <space-quiz>{"questions":[{"prompt":"…","options":["a","b"],"answer":1,"explanation":"…"}]}</space-quiz>
 * `answers="0:1 2:0"` (question:option) controls the picks from outside; standalone the element keeps its own.
 */
export class SpaceQuiz extends SpaceElement<QuizData> {
  #answers = new Map<number, number>()

  protected parseSource(): QuizData {
    const json = this.jsonSource() ?? {}
    return {
      questions: arr(json.questions).map((q) => ({
        prompt: str(q.prompt),
        options: arr(q.options).map((o) => str(o)),
        answer: Math.max(0, num(q.answer)),
        ...(str(q.explanation) ? { explanation: str(q.explanation) } : {}),
      })),
    }
  }

  get picks(): Map<number, number> {
    const attr = this.getAttribute('answers')
    if (attr === null) return this.#answers
    const map = new Map<number, number>()
    for (const pair of attr.split(/\s+/).filter(Boolean)) {
      const [q, o] = pair.split(':').map(Number)
      if (Number.isInteger(q) && Number.isInteger(o)) map.set(q, o)
    }
    return map
  }

  #pick(question: number, option: number) {
    this.#answers.set(question, option)
    if (this.emit('space-answer', { question, option }) && this.getAttribute('answers') === null) this.render()
  }

  #patch(index: number, patch: Partial<QuizData['questions'][number]>) {
    this.change({ questions: this.data.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) })
  }

  protected renderInto(root: HTMLElement) {
    const d = this.data
    const answers = this.picks
    root.className = 'space-root quiz'
    d.questions.forEach((q, qi) => {
      const picked = answers.get(qi)
      const answered = picked !== undefined
      const correct = answered && picked === q.answer
      const box = el('div', `quiz-question${answered ? (correct ? ' is-correct' : ' is-wrong') : ''}`)
      const head = el('div', 'quiz-prompt')
      head.append(el('span', 'quiz-number', String(qi + 1).padStart(2, '0')))
      if (this.isEditable) head.append(editable({ value: q.prompt, placeholder: 'question', className: 'quiz-prompt-text', multiline: true, onCommit: (prompt) => this.#patch(qi, { prompt }) }))
      else head.append(inline(q.prompt, 'quiz-prompt-text'))
      box.append(head)

      const list = el('div', 'quiz-options')
      list.setAttribute('role', 'radiogroup')
      q.options.forEach((option, oi) => {
        const isAnswer = oi === q.answer
        const row = el('div', `quiz-option${(answered || this.isPrinting) && isAnswer ? ' is-answer' : ''}${answered && picked === oi && !isAnswer ? ' is-picked' : ''}`)
        const glyph = this.isPrinting ? (isAnswer ? '✓' : '○') : answered ? (isAnswer ? '●' : picked === oi ? '×' : '○') : '○'
        if (answered || this.isPrinting) row.append(el('span', 'quiz-radio', glyph))
        else row.append(button('quiz-pick quiz-radio', glyph, () => this.#pick(qi, oi), 'pick this answer'))
        if (this.isEditable) {
          row.append(editable({ value: option, placeholder: `option ${oi + 1}`, className: 'quiz-option-text', onCommit: (text) => this.#patch(qi, { options: q.options.map((o, i) => (i === oi ? text : o)) }) }))
          if (!answered) row.append(button(`quiz-mark${isAnswer ? ' is-on' : ''}`, '✓', () => this.#patch(qi, { answer: oi }), 'mark as the right answer'))
        } else row.append(el('span', 'quiz-option-text', renderInline(option)))
        list.append(row)
      })
      box.append(list)
      if (this.isEditable && !answered) box.append(button('quiz-add-option', '+ option', () => this.#patch(qi, { options: [...q.options, ''] })))

      if (answered || (this.isPrinting && q.explanation)) {
        const feedback = el('div', 'quiz-feedback')
        if (answered) feedback.append(el('span', 'quiz-verdict', correct ? 'correct' : `not quite — the answer is “${q.options[q.answer] ?? ''}”`))
        if (q.explanation) feedback.append(el('span', 'quiz-explanation', renderInline(q.explanation)))
        box.append(feedback)
      }
      root.append(box)
    })
  }
}
