import { arr, button, el, SpaceElement, str } from './base'
import { editable, inline } from './editable'

export interface FlashcardsData {
  cards: { question: string; answer: string; cite?: string }[]
}

/**
 * <space-flashcards>{"cards":[{"question":"…","answer":"…"}]}</space-flashcards>
 * `revealed="0 2"` (card indexes) controls the open cards from outside; standalone the element keeps its own.
 */
export class SpaceFlashcards extends SpaceElement<FlashcardsData> {
  #revealed = new Set<number>()

  protected parseSource(): FlashcardsData {
    const json = this.jsonSource() ?? {}
    return { cards: arr(json.cards).map((c) => ({ question: str(c.question), answer: str(c.answer), ...(str(c.cite) ? { cite: str(c.cite) } : {}) })) }
  }

  get openCards(): Set<number> {
    const attr = this.getAttribute('revealed')
    if (attr !== null) return new Set(attr.split(/\s+/).filter(Boolean).map(Number))
    return this.#revealed
  }

  #toggle(index: number, on: boolean) {
    if (on) this.#revealed.add(index)
    else this.#revealed.delete(index)
    if (this.emit('space-reveal', { card: index, revealed: on }) && this.getAttribute('revealed') === null) this.render()
  }

  protected renderInto(root: HTMLElement) {
    const d = this.data
    const open = this.openCards
    root.className = 'space-root flashcards'
    d.cards.forEach((card, index) => {
      const shown = this.isPrinting || open.has(index)
      const box = el('div', `flashcard${shown ? ' is-revealed' : ''}`)
      if (this.isEditable) box.append(editable({ value: card.question, placeholder: 'question', className: 'flashcard-question', multiline: true, onCommit: (question) => this.change({ cards: this.data.cards.map((c, i) => (i === index ? { ...c, question } : c)) }) }))
      else box.append(inline(card.question, 'flashcard-question'))
      if (shown) {
        const answer = el('div', 'flashcard-answer')
        if (this.isEditable) answer.append(editable({ value: card.answer, placeholder: 'answer', className: 'flashcard-answer-text', multiline: true, onCommit: (a) => this.change({ cards: this.data.cards.map((c, i) => (i === index ? { ...c, answer: a } : c)) }) }))
        else answer.append(inline(card.answer, 'flashcard-answer-text'))
        const foot = el('div', 'flashcard-foot')
        if (card.cite) foot.append(button('flashcard-source', `[^${card.cite}] →`, () => this.emit('space-cite', { key: card.cite }), 'open the passage'))
        else foot.append(el('span'))
        if (!this.isPrinting) foot.append(button('flashcard-hide', 'hide', () => this.#toggle(index, false)))
        answer.append(foot)
        box.append(answer)
      } else {
        box.append(button('control flashcard-reveal', 'reveal answer', () => this.#toggle(index, true)))
      }
      root.append(box)
    })
  }
}
