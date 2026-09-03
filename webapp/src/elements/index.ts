import './elements.css'
import { SpaceCallout } from './callout'
import { SpaceDiagram } from './diagram'
import { SpaceFlashcards } from './flashcards'
import { SpaceQuiz } from './quiz'

export { SpaceCallout, SpaceDiagram, SpaceFlashcards, SpaceQuiz }
export { renderInline, renderMarkdown, sanitize, setImageResolver } from './inline'
export { CALLOUT_META, CALLOUT_TONES, toneOf, type CalloutTone } from './meta'
export type { CalloutData } from './callout'
export type { DiagramData } from './diagram'
export type { FlashcardsData } from './flashcards'
export type { QuizData } from './quiz'

const DEFINITIONS: [string, CustomElementConstructor][] = [
  ['space-callout', SpaceCallout],
  ['space-diagram', SpaceDiagram],
  ['space-flashcards', SpaceFlashcards],
  ['space-quiz', SpaceQuiz],
]

/** Registers the elements once; safe to call again (hot reloads, several bundles on a page). */
export function defineSpaceElements() {
  if (typeof customElements === 'undefined') return
  for (const [name, ctor] of DEFINITIONS) if (!customElements.get(name)) customElements.define(name, ctor)
}

defineSpaceElements()

declare global {
  interface HTMLElementTagNameMap {
    'space-callout': SpaceCallout
    'space-diagram': SpaceDiagram
    'space-flashcards': SpaceFlashcards
    'space-quiz': SpaceQuiz
  }
}
